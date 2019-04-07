var CACHE_SECONDS = 24 * 60 * 60;
var CACHE_CHUNK_SIZE = 100 * 1024;
var SPRINT_FIELD_SCHEMA = "com.pyxis.greenhopper.jira:gh-sprint";
var EPIC_LINK_FIELD_SCHEMA = "com.pyxis.greenhopper.jira:gh-epic-link";
var EPIC_NAME_FIELD_SCHEMA = "com.pyxis.greenhopper.jira:gh-epic-label";

function makeQueryParams(query_params) {
  var i = 0;
  var out = "";

  for (var param in query_params) {
   if (!query_params.hasOwnProperty(param))
     continue;
   if (i > 0)
     out += "&";
   out += param + "=" + encodeURIComponent(query_params[param]);
   i++;
  }

  return out;
}

var AtlassianRestOps = (function () {
  function AtlassianRestOps(user, api_token, instance, use_cache) {
    this.user = user;
    this.api_token = api_token;
    this.instance = "https://" + instance + "/";
    this.auth_header = Utilities.base64Encode(this.user + ":" + this.api_token);
    Logger.log("use_cache %s %s", use_cache, typeof(use_cache));
    this.use_cache_default = typeof(use_cache) == "undefined" ? 1 : use_cache;
    this.use_cache = this.use_cache_default;
       
    this.fetcher = new CachingUrlFetch();
    this.default_cache();
  }

  AtlassianRestOps.prototype.disable_cache = function () {
    this.fetcher.cache_on = this.use_cache;
  }
  
  AtlassianRestOps.prototype.default_cache = function () {
    this.fetcher.cache_on = this.use_cache_default;
  }
  
  AtlassianRestOps.prototype._do_request = function (path, query_params, body_obj, 
                                                     body_raw, force_json, 
                                                     method, add_headers, 
                                                     accept_statuses) {
    var auth_header = "Basic " + this.auth_header;
    var url = this.instance + path;    
    var headers = {};
    var params = {"muteHttpExceptions": true};

    params["headers"] = headers;
    
    if (method) 
      params["method"] = method;
    
    if (body_obj) {
      params["payload"] = JSON.stringify(body_obj);
      headers["Content-Type"] = "application/json; charset=UTF-8";
    } else if (body_raw) {
      params["payload"] = body_raw;
    }
    
    if (add_headers) {
      for (var header in add_headers) {
        if (!add_headers.hasOwnProperty(header))
          continue;
        headers[header] = add_headers[header];
      }
    }

    if (query_params)
      url += "?" + makeQueryParams(query_params);

    Logger.log("Request %s %s", url, params);
    headers["Authorization"] = auth_header;
    
    var response = this.fetcher.fetch(url, params);
    
    if ((accept_statuses && 
         !(response.code in accept_statuses)) || 
        (!accept_statuses && response.code != 200)) {
      throw "Invalid response code " + response.code + " from " + url;
    }

    var content = response.content;
    var response_type = response.type;
    
    if (response_type == "application/json") 
      content = JSON.parse(content);
        
    // Logger.log(content);
    
    return content;
  };
    
  AtlassianRestOps.prototype._iter_request = function (url, query_params, callback, entries_name) {
    // Iterate over a request where the results are paginated
    var start_at = 0; 
    query_params = copyInToObject({}, query_params || {});
    
    entries_name = entries_name || "values";
    
    while (true) {
      query_params["startAt"] = start_at;
      var content = this._do_request(url, query_params);
            
      var entries = content[entries_name];
      Logger.log("Url %s params %s", url, query_params);
      Logger.log("Got %s entries from startAt %s", entries.length, start_at);
      // Logger.log(JSON.stringify(content, null, 2));
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        callback(entry);
        start_at += 1;
      }
      
      if (content["isLast"])
        break;
      else if (('total' in content) && (start_at > content["total"]))
        break;
      else if (('maxResults' in query_params) && (start_at >= query_params['maxResults']))
        break;
      else if (!(entries.length))
        break;
      else if (query_params["startAt"] == start_at)
        break;        
    }
  }
  
  AtlassianRestOps.prototype._array_iter_request = function (url, query_params, entries_name) {
    var entries = []
    this._iter_request(url, query_params, function (entry) { entries.push(entry) }, entries_name);
    return entries;
  }
    
  return AtlassianRestOps;
}());

var JiraOps = (function () {
  function JiraOps(user, api_token, instance, use_cache) {
    AtlassianRestOps.call(this, user, api_token, instance, use_cache);
  };

  JiraOps.prototype = {};
  for (var key in AtlassianRestOps.prototype) {
    JiraOps.prototype[key] = AtlassianRestOps.prototype[key];
  }
    
  JiraOps.prototype.session_status = function () {
    return this._do_request('rest/auth/1/session');
  }
  
  JiraOps.prototype.get_search = function (jql, query_params) {
    query_params = copyInToObject({"jql": jql}, query_params || {});
    return this._array_iter_request("rest/api/2/search", query_params, "issues");
  }
  
  JiraOps.prototype.get_custom_fields = function () {
    return this._do_request("rest/api/2/field");
  }
  
  JiraOps.prototype.get_statuses = function () {
    return this._do_request("rest/api/3/status");
  }

  JiraOps.prototype.get_issuetypes = function (query_params) {
    return this._do_request("rest/api/3/issuetype", query_params);
  }
  
  JiraOps.prototype.get_issue = function (key, query_params) {
    return this._do_request("rest/api/3/issue/" + key.toString(), query_params);
  }

  JiraOps.prototype.get_issues = function (keys, query_params) {
    // Chunk ten issues at a time
    var chunk_size = 10;
    var return_issues = [];
    
    for (var i = 0; i < keys.length;) {
      var chunk_keys = keys.slice(i, i + chunk_size);
      //Logger.log("Requesting keys %s", chunk_keys);
      var new_issues = this.get_search("key in (" + chunk_keys.join(",") + ")", query_params);
      
      new_issues_by_key = arrayToObjectByKey(new_issues, 'key');
      for (var y = 0; y < chunk_keys.length; y++) {
        // Renamed or deleted issues may not appear in the search results
        // so get them individually
        if (chunk_keys[y] in new_issues_by_key)
          return_issues.push(new_issues_by_key[chunk_keys[y]]);
        else 
          return_issues.push(this.get_issue(chunk_keys[y], query_params));                             
      }
        
      i += chunk_keys.length;
    }
    return return_issues;
  }

  JiraOps.prototype.get_changelog = function (key) {
    return this._array_iter_request("rest/api/3/issue/" + key + "/changelog");
  }

  JiraOps.prototype.get_boards = function () {
    return this._array_iter_request("rest/agile/1.0/board");
  }

  JiraOps.prototype.get_board_config = function (board_id) {
    return this._do_request("rest/agile/1.0/board/" + board_id.toString() + "/configuration");
  }

  JiraOps.prototype.get_sprints = function (board_id, states, query_params) {
    query_params = copyInToObject({}, query_params);
    if (states)
      query_params["state"] = states.join(",");
    return this._array_iter_request("rest/agile/1.0/board/" + board_id.toString() + "/sprint", 
                                    query_params);
  }   
  
  JiraOps.prototype.get_sprint_issues = function (board_id, sprint_id, query_params) {
    return this._array_iter_request("rest/agile/1.0/board/" + board_id.toString() + 
                                    "/sprint/" + sprint_id.toString() + "/issue", 
                                    query_params, "issues");
  }  
  
  JiraOps.prototype.rapid_view_report = function (board_id, sprint_id, query_params) {
    // This is an internal REST interface, but it's the only way to get punted issues 
    // (i.e. issues that were dropped from the sprint)
    query_params = copyInToObject({}, query_params);
    query_params = copyInToObject(query_params, {"rapidViewId": board_id, "sprintId": sprint_id});
    return this._do_request("rest/greenhopper/1.0/rapid/charts/sprintreport",
                            query_params);
  }
  
  return JiraOps;
}());


function runTest() {
  Logger.log("Begin");
  
  // For debugging, use httpbin as the instance
  // var test = new AtlassianRestOps("sclowes@metromile.com", "XXX", "httpbin.org");
  // test._do_request("post", {"issues": "xxx?"}, {"json": "body"}, undefined, undefined, 'POST');

  // Script properties can also be saved via the script editor user interface by going to 
  // File > Project properties and selecting the Project properties tab. User properties and 
  // document properties cannot be set or viewed in the Script Editor user interface.  
  PropertiesService.getUserProperties().getProperty("JIRA_PASS");
  
  var atl = new JiraOps(PropertiesService.getUserProperties().getProperty("JIRA_USER"),
                        PropertiesService.getUserProperties().getProperty("JIRA_PASS"), 
                        PropertiesService.getUserProperties().getProperty("JIRA_INSTANCE"));
  // atl._do_request("rest/auth/1/session");
  // atl._array_iter_request("rest/api/2/search", {"jql": "issuetype = 'epic'", "maxResults": 2}, "issues");
  // atl.get_search("issuetype = 'epic'", {"maxResults": 2});
  // atl.get_custom_fields();
  // atl.get_statuses();
  // atl.get_issue("PO-1633");
  atl.session_status();
  var issues = ['BMC-1','BMC-102','BMC-132','BMC-168','BMC-194','BMC-28','BMC-72','PROD-16822','PROD-30128','PROD-31326','PROD-32003','PROD-32353']
  Logger.log(atl.get_issues(issues));
//  Logger.log(data);
}
