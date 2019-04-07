/**
 * Split a string in to slices with a maximum length
 * @param {string} str The string to slice
 * @param {number} len The maximum length for each slice
 * @return {string[]} String slices 
 */
function splitSlice(str, len) {
  var ret = [ ];
  for (var offset = 0, strLen = str.length; offset < strLen; offset += len) {
    ret.push(str.slice(offset, len + offset));
  }
  return ret;
}

/**
 * Copy a source object's keys in to a target object
 * @param {Object} target The target object
 * @param {number} len The source object
 * @return {Object} The target object, useful for chaining
 */
function copyInToObject(target, source) {
  for (var key in source) {
    if (!source.hasOwnProperty(key))
      continue;
    target[key] = source[key];
  }
  return target;
}

/* 
 * Get Object Length
 * @param {Object} obj The object who's keys we want to count
 * @return {number} The count of keys in the object
 */ 
function objectLength(obj) {
  var i = 0;
  for (var key in obj)
    if (obj.hasOwnProperty(key))
      i++;
  return i; 
}

/* 
 * Convert array to object by choosing a key from each entry 
 * @param {Object[]} arr - Array of objects
 * @return {Object} An object that references the array entries based on a key
 */ 
function arrayToObjectByKey(arr, key) {
  var by_key = {};
  for (var i = 0; i < arr.length; i++) 
    by_key[arr[i][key]] = arr[i];
  return by_key; 
}

/* 
 * Take an array of keys and look them up in an object
 * @param {string[]} arr - Array of keys
 * @param {Object} obj - Object to lookup keys in
 * @return {Object[]} Array of results
 */ 
function mapArrayToObject(arr, obj) {
  if (!arr)
    return [];
  return arr.map(function (e) {
    if (!(e in obj))
      return null;
    return obj[e];
  }, this);
}

/* 
 * Take an array of objects and return an array of the value of a key in each object
 * @param {Object[]} arr - Array of objects
 * @param {string} key - Key to lookup in each object
 * @return {Object[]} Array of results
 */
function arrayDerefKey(arr, key) {
  if (!arr)
    return [];
  return arr.map(function (e) { 
    if (!e)
      return e;
    return e[key];
  }, this);
}

/* 
 * Take an array and make the values in to keys in an object
 * @param {Object[]} arr - Array of keys
 * @return {Object} Object with keys from array entries
 */
function makeSetObjectFromArray(arr) {
  var obj = {};
  for (var i = 0; i < arr.length; i++) 
    obj[arr[i]] = 1;
  return obj;
}

/* 
 * Return the continuous run of elements that match
 * a search funtion at the head of an array
 * @param {Object[]} a - Array 
 * @param {functio } m - Function to match entries in the array 
 * @return {Object[]} Objects from the start of the array that matched
 */
function arrMatchHead(a, m) {
  var o = [];
  for (var i = 0; i < a.length; i++) {
    if (!m(a[i]))
      break;
    o.push(a[i])
  }
  return o;
}

/* 
 * Return the continuous run of elements that match
 * a search funtion at the end of an array
 * @param {Object[]} a - Array 
 * @param {functio } m - Function to match entries in the array 
 * @return {Object[]} Objects from the end of the array that matched
 */
function arrMatchTail(a, m) {
  var o = [];
  for (var i = a.length - 1; i >= 0; i--) {
    if (m(a[i]))
      o.unshift(a[i]);
    else 
      break;
  }
  return o;
}

/* 
 * Return the last element of an array
 * @param {Object[]} a - Array 
 * @return {Object} Last element from the array or undefined
 */
function arrLast(a) {
  return a.length > 0 ? a[a.length - 1] : undefined;
}

/* 
 * Return the first element of an array
 * @param {Object[]} a - Array 
 * @return {Object} First element from the array or undefined
 */
function arrFirst(a) {
  return a.length > 0 ? a[0] : undefined;
}

