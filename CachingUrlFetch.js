var CachingUrlFetch = (function () {
  function CachingUrlFetch() {
     this.cache_on = 1;    
  }

  function getCacheResponse(request_digest) {
    Logger.log(request_digest);
    var cache_result = CacheService.getUserCache().get(request_digest);
    if (!cache_result)
      return;
    
    var cache_object = JSON.parse(cache_result);
    
    if (cache_object.chunks) {
      cache_object.compressed_content = "";
      for (var i = 0; i < cache_object.chunks; i++) {      
        var chunk_name = "chunk_" + i.toString() + "_" + request_digest;
        Logger.log("Loading chunk %s", chunk_name);
        cache_object.compressed_content += CacheService.getUserCache().get(chunk_name);      
      }
    }
    
    if (cache_object.compressed_content) {
      var blob = Utilities.newBlob(Utilities.base64Decode(cache_object.compressed_content), "application/x-gzip");
      cache_object.content = Utilities.ungzip(blob).getDataAsString();
    }
    return cache_object;
  }
  
  function setCacheResponse(request_digest, response) {
    var cache_object = copyInToObject({}, response);
    var content = cache_object.content;
    var compressed_content = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(content)).getBytes());
    Logger.log("Caching %s with length %s (was %s)", request_digest, compressed_content.length, content.length);
    
    var chunks = splitSlice(compressed_content, CACHE_CHUNK_SIZE); 
    if (chunks.length == 1) {
      cache_object.compressed_content = compressed_content;
      delete cache_object["content"];
      CacheService.getUserCache().put(request_digest, JSON.stringify(cache_object), CACHE_SECONDS);
    } else {
      cache_object.chunks = chunks.length;
      delete cache_object["content"];
      CacheService.getUserCache().put(request_digest, JSON.stringify(cache_object), CACHE_SECONDS);
      for (var i = 0; i < chunks.length; i++) {
        var chunk_name = "chunk_" + i.toString() + "_" + request_digest;
        Logger.log("Saving chunk %s", chunk_name);
        CacheService.getUserCache().put(chunk_name, chunks[i], CACHE_SECONDS);
      }
      Logger.log("Saved with %s chunks" % chunks.length);
    }
  }

  
  CachingUrlFetch.prototype.fetch = function (url, params) {
    var request_digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url + JSON.stringify(params));

    if (this.cache_on) {      
      Logger.log("Checking cache for %s %s", url, request_digest);
      var cache_result = getCacheResponse(request_digest);
      
      if (cache_result) {
        Logger.log("Cache hit");
        return cache_result;
      }
    }
    
    var raw_response = UrlFetchApp.fetch(url, params);
    
    var response = {"code": raw_response.getResponseCode(), 
                    "type": raw_response.getHeaders()["Content-Type"].split(";", 1)[0].toLowerCase(),
                    "content": raw_response.getContentText("utf8") };
                        
    if (response.code == 200 && this.cache_on) 
      setCacheResponse(request_digest, response);

    return response;
  }
  
  return CachingUrlFetch;
})();
