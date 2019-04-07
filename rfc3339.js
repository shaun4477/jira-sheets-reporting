function parseRfc3339Date(d) {
  var rfc3339Date = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(?:([zZ])|([+-]\d{2}):?(\d{2}))$/;
  var m = rfc3339Date.exec(d);
  var year   = +m[1];
  var month  = +m[2];
  var day    = +m[3];
  var hour   = +m[4];
  var minute = +m[5];
  var second = +m[6];
  var msec   = m[7] ? parseInt(m[7].replace(/^00*/, "") || "0") : 0;
  var tzHour = 0;
  var tzMin  = 0;
  if (!m[8]) {
    tzHour = +m[9];
    tzMin  = +m[10];
  }
  
  // Logger.log("%s = %s %s %s %s %s %s %s %s %s %s", d, m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10]);
  // Logger.log("%s = %s %s %s %s %s %s %s %s %s",    d, year, month, day, hour, minute, second, msec, tzHour, tzMin);

  var tzOffset = new Date().getTimezoneOffset() + tzHour * 60 + tzMin;

  return new Date(year, month - 1, day, hour, minute - tzOffset, second, msec);
}

function testDate() {
  Logger.log(parseRfc3339Date("2018-10-18T15:36:45.086-0700"));
  var d = parseRfc3339Date("2019-02-14T04:28:00.000Z");
  Logger.log("Date %s", d);
}
