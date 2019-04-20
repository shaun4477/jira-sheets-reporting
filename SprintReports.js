var BEFORE_SPRINT = -1;
var DURING_SPRINT = 0;
var AFTER_SPRINT = 1;
var FIELD_VALUE_UNKNOWN = "__FIELD_VALUE_UNKNOWN__";

/* 
 * Find a field based on schema
 */ 
function findFieldBySchema(fields_by_id, schema) {
  for (var field_id in fields_by_id) {
    if (!fields_by_id.hasOwnProperty(field_id))
      continue;
    if (fields_by_id[field_id].schema &&
        fields_by_id[field_id].schema.custom == schema)
      return fields_by_id[field_id];
  }
}

/** 
 * Get punted issues from sprint
 */
function sprintPuntedIssues(board, sprint, atl) {
  var rapid_view_report = atl.rapid_view_report(board.id, sprint.id);
  // Logger.log(rapid_view_report);
  
  var keys = [];
  for (var i = 0; i < rapid_view_report.contents.puntedIssues.length; i++) 
    keys.push(rapid_view_report.contents.puntedIssues[i].key);
  
  if (!keys.length)
    return [];
  
  var issues = atl.get_issues(keys, {"expand": "changelog"});
  for (var i = 0; i < issues.length; i++)
    issues[i].punted = true;
  
  return issues;
}

/** 
 * Class to track important sprint related fields through an issue's
 * history 
 */ 
var FieldTracker = (function () {
  function FieldTracker(issue, sprint_field_id, sprint_start, sprint_complete, estimate_field_id, 
                        epic_link_field_id) {
    this.issue = issue; 
    this.sprint_start = sprint_start;
    this.sprint_complete = sprint_complete;
    this.sprint_field_id = sprint_field_id; 
    this.estimate_field_id = estimate_field_id; 
    this.epic_link_field_id = epic_link_field_id; 
    this.fields = {};
    this.add_field("status",
                   function (issue) { return issue.fields.status.id },
                   function (history) { return history["from"] },
                   function (history) { return history["to"] });
    this.add_field(this.sprint_field_id,
                   function (issue) {
                     var v = issue.fields[sprint_field_id];
                     if (!v) return v;
                     else {
                       var r = v.map(function (e) {
                         var m = e.match(/[\[,]id=([^,\]]*)/);
                         if (!m)
                           throw("Failed parsing field " + m);
                         return parseInt(m[1]);
                       });
                       Logger.log("Matched sprint %s to %s", v, r);
                       return r;
                     } 
                   },
                   function (history) {
                     var r = history.from ? history.from.split(',').map(function (e) { return parseInt(e) }) : null;
                     return r;
                   },
                   function (history) {
                     var r = history.to ? history.to.split(',').map(function (e) { return parseInt(e) }) : null;
                     return r;
                   });
    this.add_field(estimate_field_id,
                   function (issue) { return issue.fields[estimate_field_id] },
                   function (history) { return parseInt(history.fromString) },
                   function (history) { return parseInt(history.toString) });
    this.add_field(epic_link_field_id,
                   function (issue) { return issue.fields[epic_link_field_id] },
                   function (history) { return history.fromString },
                   function (history) { return history.toString });
    
    this.process_history();
  }

  FieldTracker.prototype.add_field = function (id, issue_lookup, change_from, change_to) {
    this.fields[id] = { issue_lookup: issue_lookup, change_from: change_from, change_to: change_to };
  }

  FieldTracker.prototype.fill_unknown_history = function (id, value, before_idx) {
    for (var i = before_idx - 1; i >= 0; i--) {
      var log = this.log[i];
      if (log[id] === FIELD_VALUE_UNKNOWN)
        log[id] = value;
      else
        // Do not fill past a known value
        break;
    }
  }

  FieldTracker.prototype.add_change = function (id, to, from, history, sprint_position, created_ts) {
    var change = { created_ts: created_ts, sprint_position: sprint_position };
    for (var key in this.fields) {
      if (!this.fields.hasOwnProperty(key))
        continue;
      if (id == key) {
        change[key] = to;
        this.current[key] = to;
      } else
        change[key] = this.current[key];
    }

    change["history"] = history;
    
    this.log.push(change);

    // If we now have the previous value for this field and the
    // log for this field has unknown values in the past,
    // fill those in
    if (from !== undefined)
      this.fill_unknown_history(id, from, this.log.length - 1);
  }

  FieldTracker.prototype.process_history = function () {
    // Store running view of 'current' value during traversal
    this.current = {};
    for (var key in this.fields) {
      if (!this.fields.hasOwnProperty(key))
        continue;
      this.current[key] = FIELD_VALUE_UNKNOWN;
    }

    // Log of field values throughout all of history
    this.log = [];

    // Store a 'fake' history value for these fields at issue creation
    // time that we'll update as we go
    var created_ts = parseRfc3339Date(this.issue.fields.created);
    var created_sprint_position = created_ts < this.sprint_start ? BEFORE_SPRINT : 
                                                                   (created_ts >= this.sprint_complete ? AFTER_SPRINT : DURING_SPRINT);
    this.add_change("fake_field_not_used", undefined, undefined, {"fake_history": "issue_created"}, 
                    created_sprint_position, created_ts.getTime());

    var changelog = this.issue.changelog;
    for (var i = 0; i < changelog.histories.length; i++) {
      var history_item = changelog.histories[i];
      var sprint_position = history_item.created_ts < this.sprint_start ? BEFORE_SPRINT :
                                                                          (history_item.created_ts >= this.sprint_complete ? AFTER_SPRINT :
                                                                                                                             DURING_SPRINT);
      //Logger.log("History %s %s %s %s %s", sprint_position, this.issue.key, history_item.created,
      //           history_item.created_date, history_item.created_ts);

      for (var x = 0; x < history_item.items.length; x++) {
        var item = history_item.items[x];
        if (!(item.fieldId in this.fields))
          continue;

        Logger.log("Change item %s %s", this.issue.key, item);
        this.add_change(item.fieldId,
                        this.fields[item.fieldId].change_to(item),
                        this.fields[item.fieldId].change_from(item),
                        item, sprint_position, history_item.created_ts);
      }
    }

    // For any field that has no change history the current
    // field value must by definition be the current value
    // for all time (i.e. since the issue was created)
    for (var key in this.fields) {
      if (!this.fields.hasOwnProperty(key) || this.current[key] != FIELD_VALUE_UNKNOWN)
        continue;

      var value = this.fields[key].issue_lookup(this.issue);
      this.current[key] = value;
      this.fill_unknown_history(key, value, this.log.length);
      //if (this.issue.key == "SHAUN-15")
      //  throw("Check");
    }
  }

  FieldTracker.prototype.get_last_matching = function (match_func) {    
    for (var i = this.log.length - 1; i >= 0; i--) {
      if (match_func(this.log[i])) 
        return this.log[i];
    }
    return;
  }   
  
  FieldTracker.prototype.get_last_values = function (sprint_position) {  
    return this.get_last_matching(function (l) { return l.sprint_position <= sprint_position });
  }

  return FieldTracker;
})();

/** 
 * Class to generate a report for a sprint on a board
 */ 
var SprintReport = (function () {
  function SprintReport(board_name, board, board_config, sprint, sprint_field, 
                        epic_link_field, epic_name_field,
                        statuses_by_id, fields_by_id, sprints_by_id, 
                        atl) {
    this.board_name = board_name; 
    this.board = board;
    this.sprint = sprint;
    this.sprint_field = sprint_field;
    this.sprint_start = parseRfc3339Date(sprint.startDate);
    this.sprint_end = parseRfc3339Date(sprint.endDate);
    this.sprint_complete = parseRfc3339Date(sprint.completeDate);
    this.estimate_field = board_config.estimation.field;
    this.epic_link_field = epic_link_field;
    this.epic_name_field = epic_name_field;
    this.done_column = board_config.columnConfig.columns[board_config.columnConfig.columns.length - 1];
    
    this.done_statuses_by_id = {};
    for (var i = 0; i < this.done_column.statuses.length; i++) 
      this.done_statuses_by_id[this.done_column.statuses[i].id] = statuses_by_id[this.done_column.statuses[i].id];
    
    this.atl = atl;
    
    this.statuses_by_id = statuses_by_id;
    this.sprints_by_id = sprints_by_id; 

    this.enrich_data();
    this.get_sprint_summary();
    this.get_sprint_issues();

  }
  
  SprintReport.prototype.enrich_data = function () {
    var sprint_issues = arrayToObjectByKey(this.atl.get_sprint_issues(this.board.id, this.sprint.id, 
                                                                      {"expand": "changelog"}),
                                           "key");
    Logger.log("Got %s issues", objectLength(sprint_issues));
  
    var punted_issues = arrayToObjectByKey(sprintPuntedIssues(this.board, this.sprint, this.atl), "key");
  
    var all_issues = copyInToObject({}, sprint_issues);
    all_issues = copyInToObject(all_issues, punted_issues);

    // Enrich issues by:
    // - getting the full changelog if some is missing
    // - parsing out values of key fields over history
    for (var issue_key in all_issues) {
      if (!all_issues.hasOwnProperty(issue_key) || (this.only_issue && this.only_issue != issue_key))
        continue;
    
      var issue = all_issues[issue_key];
       
      // Logger.log("Checking changelog for %s, length %s", issue.key, issue.changelog ? issue.changelog.total : null);
    
      if (!issue.changelog) {
        issue.changelog = {total: 0, histories: []};
      } else if (issue.changelog.total < issue.changelog.histories.length) {
        var new_changelog = atl.get_changelog(issue_key); 
        issue.changelog.histories = new_changelog;
      }
    
      var changelog = issue.changelog;
    
      for (var i = 0; i < issue.changelog.histories.length; i++) {
        if (changelog.histories[i].created) {
          changelog.histories[i].created_date = parseRfc3339Date(changelog.histories[i].created); 
          changelog.histories[i].created_ts = changelog.histories[i].created_date.getTime();
        } else {
          changelog.histories[i].created_date = null;
          changelog.histories[i].created_ts = 0;
        }
      }
    
      // Sort the changelogs by created time
      var compare = function (a, b) { return a.created_ts - b.created_ts; };
      changelog.histories = changelog.histories.sort(compare);
 
      // Keep a log of the changes of major fields over the life of the issue
      var ft = new FieldTracker(issue, this.sprint_field.id, 
                                this.sprint_start, this.sprint_complete, 
                                this.estimate_field.fieldId, this.epic_link_field.id);
      issue.field_history = ft;
            // Logger.log("Field history full %s", issue.field_history);
      Logger.log("Field history %s %s", issue.key, JSON.stringify(issue.field_history.log, null, 2));
    }

    // Move subtasks out of the main issue list, they can't go in to
    // a sprint without their parent and the sprint can't be closed 
    // with a completed story with incomplete subtasks
    for (var issue_key in all_issues) {
      if (!all_issues.hasOwnProperty(issue_key) || (this.only_issue && this.only_issue != issue_key))
        continue;

      var issue = all_issues[issue_key];

      if (!issue.fields.issuetype.subtask)
        continue;
  
      var parent_issue = all_issues[issue.fields.parent.key];
      if (!("subtasks" in parent_issue)) 
        parent_issue.subtasks = [];
      parent_issue.subtasks.push(issue);
  
      delete all_issues[issue_key];
      delete sprint_issues[issue_key];
      delete punted_issues[issue_key];
    }

    this.all_issues = all_issues; 
    
    // Collect all epic information 
    var epics_by_key = {}

    for (var issue_key in all_issues) {
      if (!all_issues.hasOwnProperty(issue_key) || (this.only_issue && this.only_issue != issue_key))
        continue;
      
      var issue = all_issues[issue_key];
      var epic_link_field_id = this.epic_link_field.id;
      var epic_link_field_history = issue.field_history.log.filter(function (e) { return e[epic_link_field_id] });
      for (var i = 0; i < epic_link_field_history.length; i++) 
        epics_by_key[epic_link_field_history[i][epic_link_field_id]] = 1;
    }    
    
    if (objectLength(epics_by_key)) {
      // The key retrieved from get_issues may differ from the requested key if the 
      // issue key was changed so be sure to map the key requested and the key 
      // returned
      var epic_keys = Object.keys(epics_by_key);
      var epics = this.atl.get_issues(epic_keys);
      for (var i = 0; i < epic_keys.length; i++)
        epics_by_key[epic_keys[i]] = epics[i];
      this.epics_by_key = epics_by_key;
    } else
      this.epics_by_key = {};
    
    for (var issue_key in all_issues) {
      if (!all_issues.hasOwnProperty(issue_key) || (this.only_issue && this.only_issue != issue_key))
        continue;

      var issue = all_issues[issue_key];
      
      // Summarize information about the issue
      issue.report = {}
      
      // Get last value of fields at different sprint phases
      var fields_before_sprint = issue.field_history.get_last_values(BEFORE_SPRINT);
      var fields_during_sprint = issue.field_history.get_last_values(DURING_SPRINT);

      var in_sprint_at_start = fields_before_sprint && fields_before_sprint[this.sprint_field.id] &&
                               fields_before_sprint[this.sprint_field.id].indexOf(this.sprint.id) != -1 || false;
      var in_sprint_at_end   = fields_during_sprint && fields_during_sprint[this.sprint_field.id] &&
                               fields_during_sprint[this.sprint_field.id].indexOf(this.sprint.id) != -1 || false;
        
      if (issue.key == "AVAEXP-332") {
        Logger.log("%s %s %s %s %s %s", fields_before_sprint, fields_before_sprint[this.sprint_field.id], 
                   fields_before_sprint[this.sprint_field.id].indexOf(this.sprint.id), this.sprint.id, 
                   typeof(this.sprint.id), typeof(fields_before_sprint[this.sprint_field.id][0]));
        Logger.log("Here %s", in_sprint_at_start);
      }
      
      // Get the first value of the fields when the issue joined the sprint, either 
      // at sprint start or when added
      var join_sprint_fields;
      if (in_sprint_at_start)
        join_sprint_fields = fields_before_sprint;
      else {
        var in_sprint_log = issue.field_history.log.filter(function (e) {
          return e.sprint_position == DURING_SPRINT && 
                 e[this.sprint_field.id] && 
                 e[this.sprint_field.id].indexOf(this.sprint.id) != -1; 
        }, this);
        join_sprint_fields = in_sprint_log[0];
      }
            
      var status_changes_during_sprint = issue.field_history.log.filter(function (e) {
        return e.sprint_position == DURING_SPRINT && e.history.fieldId == "status";
      });
      
      var estimate_before_sprint = join_sprint_fields   && join_sprint_fields[this.estimate_field.fieldId];
      var estimate_during_sprint = fields_during_sprint && fields_during_sprint[this.estimate_field.fieldId];
      
      var done_before_sprint = fields_before_sprint && 
                               fields_before_sprint["status"] in this.done_statuses_by_id;
      var done_during_sprint = fields_during_sprint && 
                               fields_during_sprint["status"] in this.done_statuses_by_id;

      issue.report.issue_type = issue.fields.issuetype.name;
      issue.report.final_status = this.statuses_by_id[fields_during_sprint["status"]].name;

      issue.report.epic_key = "";
      issue.report.epic_name = "";
      var epic_field = issue.field_history.current[this.epic_link_field.id];
      if (epic_field) {
        issue.report.epic_key = epic_field;
        var epic = this.epics_by_key[epic_field];
        if (epic)
          issue.report.epic_name = epic.fields[this.epic_name_field.id];
      }

      issue.report.dropped_from_sprint = issue.key in punted_issues;
      issue.report.added_to_sprint = !in_sprint_at_start;

      // In the Jira Sprint Report an issue is considered 'completed outside of this sprint' 
      // if it was in a done state before the sprint began and the status during the sprint
      // did not change. It does not matter if the status changes to another done status and 
      // back to the original done status, the issue is still considered completed inside 
      // the sprint in this case
      issue.report.completed_outside_sprint = done_during_sprint && !status_changes_during_sprint.length;
      issue.report.completed = done_during_sprint;

      // The value on the right (Y) of the 'Story Points (X → Y)' column in the Jira Sprint 
      // report is always the final value of the estimate field for that issue during the sprint 
      // timeline. The value on the left is the estimate at sprint start time (if the issue was
      // in the sprint before the sprint started) or the value when the story entered the 
      // sprint otherwise
                  
      // Details for the velocity report:
      // - The commitment only shows estimates for issues in the sprint before it started. It does 
      // not matter if the issues were already done when they entered the sprint
      // - The completed shows the final estimate value of issues 'done' at the end of the sprint,
      // but does NOT include issues considered completed outside of the sprint
      
      if (in_sprint_at_start) {
        issue.report.issue_committed = 1;
        issue.report.estimate_committed = estimate_before_sprint;
      } else {
        issue.report.issue_committed = 0;
        issue.report.estimate_committed = undefined;
      }
      
      if (issue.report.added_to_sprint) {
        issue.report.issue_added = 1;
        issue.report.estimate_added = estimate_before_sprint
      } else {
        issue.report.issue_added = 0; 
        issue.report.estimate_added = undefined;
      }
      
      if (!issue.report.completed_outside_sprint && done_during_sprint) {
        issue.report.issue_completed = 1;
        issue.report.estimate_completed = estimate_during_sprint;
      } else {
        issue.report.issue_completed = 0;
        issue.report.estimate_completed = undefined;
      }
 
      issue.report.start_estimate = estimate_before_sprint;
      issue.report.end_estimate   = estimate_during_sprint;
      issue.report.key = issue.key;
      issue.report.issue_link = this.atl.instance + "browse/" + issue.key;
      issue.report.epic_link = issue.report.epic_key ? this.atl.instance + "browse/" + issue.key : "";
      issue.report.summary = issue.fields.summary;        
      Logger.log("Issue %s (%s) with final sprint status %s\nEpic %s %s\nEstimate %s - %s\nCommitment %s %s\nAdded %s %s\nCompleted %s %s\n", 
                 issue.report.key, 
                 issue.report.issue_type, 
                 issue.report.final_status,
                 issue.report.epic_key, issue.report.epic_name,
                 issue.report.start_estimate, issue.report.end_estimate,
                 issue.report.issue_committed, issue.report.estimate_committed,
                 issue.report.issue_added, issue.report.estimate_added,
                 issue.report.issue_completed, issue.report.estimate_completed); 
      
      if (issue.key == "AVAEXP-332")
        Logger.log("Field history %s %s", issue.key, JSON.stringify(issue.field_history.log, null, 2));
    }     
    
    // Logger.log("Epics %s", this.epics_by_key);
  }
  
  SprintReport.prototype.test_issue_done = function (issue, sprint_position) { 
    sprint_position = typeof(sprint_position) == "undefined" ? DURING_SPRINT : sprint_position;
    
    var done_statuses_by_id = this.done_statuses_by_id;
 
    var get_done_log_entry = function (issue) {
      // Get all issue history that is up to the phase we're looking for
      var history = arrMatchHead(issue.field_history.log, function (e) { return e.sprint_position <= sprint_position });
      
      // Get the run of history at the end of the log where the issue is in a 'done' state
      var done_history = arrMatchTail(history, function (e) { return e["status"] in done_statuses_by_id });
      
      // Get the entry for the first time the issue was set to done and stayed that way in the specified sprint phase
      var first_done = arrFirst(done_history);
      return first_done;
    };
    
    // A Sprint can't be completed with incomplete subtasks associated with a 
    // complete story. Sub-tasks are always included in the same sprint as their parent issue.    
    var issue_first_done = get_done_log_entry(issue);
    
    return issue_first_done;    
  }
  
  SprintReport.prototype.get_sprint_summary = function () {
    var issues_committed = 0;
    var estimate_committed = 0;
    var issues_added = 0;
    var estimate_added = 0;
    var issues_completed = 0;
    var estimate_completed = 0;

    for (var issue_key in this.all_issues) {
      if (!this.all_issues.hasOwnProperty(issue_key) || (this.only_issue && this.only_issue != issue_key))
        continue;
    
      var issue = this.all_issues[issue_key];    
      //Logger.log("Issue %s", issue.key);
      issues_committed += issue.report.issue_committed;
      estimate_committed += issue.report.estimate_committed || 0;
      issues_added += issue.report.issue_added;
      estimate_added += issue.report.estimate_added || 0;
      issues_completed += issue.report.issue_completed;
      estimate_completed += issue.report.estimate_completed || 0;      
    } 
    
    var r = {sprint_name: this.sprint.name,
             board_name: this.board_name,
             board_url: this.atl.instance + "secure/RapidBoard.jspa?view=planning.nodetail&rapidView=" + this.board.id,
             report_url: this.atl.instance + "secure/RapidBoard.jspa?view=reporting&chart=sprintRetrospective&rapidView=" + this.board.id + "&sprint=" + this.sprint.id,
             sprint_start: this.sprint_start,
             sprint_end: this.sprint_complete,
             issues_committed: issues_committed,
             estimate_committed: estimate_committed,
             issues_added: issues_added,
             estimate_added: estimate_added, 
             issues_completed: issues_completed,
             estimate_completed: estimate_completed};
    //Logger.log("Report\n%s\n", JSON.stringify(r, null, 2));
    return r;
  }
  
  SprintReport.prototype.get_sprint_issues = function () {
    var issues = [];
    for (var issue_key in this.all_issues) {
      if (!this.all_issues.hasOwnProperty(issue_key) || (this.only_issue && this.only_issue != issue_key))
        continue;
    
      var issue = this.all_issues[issue_key];    
      issues.push(issue.report);
    }
    return issues;
  } 
  
  return SprintReport;
})();

/** 
 * Class to run reports on sprints based on boards
 */ 
var ReportRunner = (function () { 
  function ReportRunner(atl) {
    this.atl = atl;

    this.statuses_by_id  = arrayToObjectByKey(this.atl.get_statuses(), "id");
    this.fields_by_id    = arrayToObjectByKey(this.atl.get_custom_fields(), "id");

    this.sprint_field    = findFieldBySchema(this.fields_by_id, SPRINT_FIELD_SCHEMA);
    this.epic_link_field = findFieldBySchema(this.fields_by_id, EPIC_LINK_FIELD_SCHEMA);
    this.epic_name_field = findFieldBySchema(this.fields_by_id, EPIC_NAME_FIELD_SCHEMA);
    this.all_boards      = this.atl.get_boards()
    this.boards_by_name  = arrayToObjectByKey(this.all_boards, "name");
    this.boards_by_id    = arrayToObjectByKey(this.all_boards, "id");

    Logger.log(this.boards);    
  }

  ReportRunner.prototype.run_report_by_id = function (board_id, num_sprints_back, callback) {
    var board = this.boards_by_id[board_id];
    return this._run_report(board, num_sprints_back, callback);
  }

  ReportRunner.prototype.run_report_by_name= function (board_name, num_sprints_back, callback) {
    var board = this.boards_by_name[board_name];
    return this._run_report(board, num_sprints_back, callback);
  }
  
  ReportRunner.prototype._run_report = function (board, num_sprints_back, callback) {
    num_sprints_back = num_sprints_back || 1;
    var board_config = this.atl.get_board_config(board.id); 
    var board_name = board.name;
    var compare = function (a, b) { return a.completeDate < b.completeDate ? -1 : a.completeDate == b.completeDate ? 0 : 1 };
    this.atl.disable_cache();
    var sprints = this.atl.get_sprints(board.id, ["closed"]).sort(compare);
    this.atl.default_cache();
    var sprints_by_id = arrayToObjectByKey(sprints, "id");
    
    for (var j = sprints.length < num_sprints_back ? 0 : sprints.length - num_sprints_back; j < sprints.length; j++) {
      var sprint = sprints[j];
      var report = new SprintReport(board_name, board, board_config, sprint, 
                                    this.sprint_field, 
                                    this.epic_link_field, 
                                    this.epic_name_field,
                                    this.statuses_by_id, 
                                    this.fields_by_id, 
                                    sprints_by_id, 
                                    this.atl);
      var sprint_summary = report.get_sprint_summary();
      Logger.log("Report\n%s\n", JSON.stringify(report.get_sprint_summary(), null, 2));
      Logger.log("Issues\n%s\n", JSON.stringify(report.get_sprint_issues(), null, 2));
      if (callback)
        callback(report);
    }
  }
  
  return ReportRunner;
})();

function testReports() {
  var atl = getJiraOps();
  var report_boards = [157];
  
  var runner = new ReportRunner(atl);
  for (var i = 0; i < report_boards.length; i++) 
    // runner.run_report_by_name(report_boards[i], 20);
    runner.run_report_by_id(report_boards[i], 20);
}
