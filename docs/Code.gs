/**
 * ev-go sign-up capture, anonymous visit tracking and dashboard. Bound to a Google Sheet.
 * Deploy as Web app: Execute as "Me", Who has access "Anyone".
 *
 * Tabs (created automatically): Drivers, Riders, Fleet, Visits, Events, Dashboard.
 * After pasting this version: Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy.
 * Then, once: select the function setupDashboard in the editor toolbar and click Run.
 */

var AREAS = ['HITEC City', 'Madhapur', 'Gachibowli', 'Kondapur', 'Kukatpally', 'Miyapur', 'Ameerpet', 'Other'];
var ALLOWED = {
  vehicle_type: ["E-auto", "E-bike", "E-cab", "I don't have an EV yet"],
  ownership: ['Own', 'Rent', 'Planning to buy'],
  language: ['Telugu', 'Hindi', 'English', 'Urdu'],
  ride_type: ['Office commute', 'Metro first or last mile', 'Airport', 'Other'],
  org_type: ['Fleet owner', 'IT park or company', 'School or hospital']
};
var EVENTS = ['wa_click', 'call_click', 'form_start', 'calc_driver', 'calc_trip'];
var DEVICES = ['Android', 'iOS', 'Desktop', 'Other'];
var SOURCES = ['hitec', 'madhapur', 'gachibowli', 'kondapur', 'kukatpally', 'miyapur', 'ameerpet', 'autostand'];
var MAX_SIGNUPS_PER_10_MIN = 60;
var MAX_TRACKING_PER_10_MIN = 900;

var COLS = {
  Drivers: ['Timestamp (IST)', 'Name', 'Mobile', 'Vehicle type', 'Ownership', 'Area', 'Language', 'Consent', 'UTM source', 'UTM medium', 'Page', 'Visit ID'],
  Riders:  ['Timestamp (IST)', 'Name', 'Mobile', 'Area', 'Ride type', 'Consent', 'UTM source', 'UTM medium', 'Page', 'Visit ID'],
  Fleet:   ['Timestamp (IST)', 'Name', 'Company', 'Mobile', 'Type', 'Size', 'Area', 'Consent', 'UTM source', 'UTM medium', 'Page', 'Visit ID'],
  Visits:  ['Timestamp (IST)', 'Date', 'Visit ID', 'Source', 'Medium', 'Device', 'Language', 'Referrer', 'Path', 'Returning'],
  Events:  ['Timestamp (IST)', 'Date', 'Visit ID', 'Source', 'Event']
};

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.type === 'visit') return trackVisit_(d);
    if (d.type === 'event') return trackEvent_(d);
    return signup_(d);
  } catch (err) {
    return reply_(false, 'Something went wrong. Please message us on WhatsApp instead.');
  }
}

function doGet() {
  return ContentService.createTextOutput('ev-go sign-up endpoint is running.');
}

/* ---------- Anonymous tracking ---------- */

function trackVisit_(d) {
  var cache = CacheService.getScriptCache();
  if (overCap_(cache, 'tracking', MAX_TRACKING_PER_10_MIN)) return reply_(true, 'ok');
  var vid = cleanId_(d.visit_id);
  if (!vid) return reply_(true, 'ok');
  if (cache.get('v_' + vid)) return reply_(true, 'ok');   // one visit row per visitor per 6 hours
  cache.put('v_' + vid, '1', 21600);
  var ts = now_();
  var device = DEVICES.indexOf(d.device) === -1 ? 'Other' : d.device;
  tab_('Visits').appendRow([ts.full, ts.day, vid, cleanSrc_(d.source), cleanSrc_(d.medium), device,
    safe_(String(d.lang || '').slice(0, 12)), safe_(cleanHost_(d.referrer)), safe_(String(d.path || '').slice(0, 60)),
    d.returning === 'yes' ? 'yes' : 'no']);
  return reply_(true, 'ok');
}

function trackEvent_(d) {
  var cache = CacheService.getScriptCache();
  if (overCap_(cache, 'tracking', MAX_TRACKING_PER_10_MIN)) return reply_(true, 'ok');
  var vid = cleanId_(d.visit_id);
  if (!vid || EVENTS.indexOf(d.event) === -1) return reply_(true, 'ok');
  var key = 'e_' + vid + '_' + d.event;
  if (cache.get(key)) return reply_(true, 'ok');          // ignore repeat taps within 30 seconds
  cache.put(key, '1', 30);
  var ts = now_();
  tab_('Events').appendRow([ts.full, ts.day, vid, cleanSrc_(d.source), d.event]);
  return reply_(true, 'ok');
}

/* ---------- Sign-ups ---------- */

function signup_(d) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    if (d.website) return reply_(true, "You're on the list. We'll WhatsApp you before launch.");
    if (d.consent !== 'yes') return reply_(false, 'Please tick the box so we can contact you.');

    var cache = CacheService.getScriptCache();
    if (overCap_(cache, 'signups', MAX_SIGNUPS_PER_10_MIN, true)) return reply_(false, 'We are getting many requests. Please try again in a few minutes or message us on WhatsApp.');

    var mobile = String(d.mobile || '').replace(/\D/g, '');
    if (mobile.length === 12 && mobile.indexOf('91') === 0) mobile = mobile.slice(2);
    if (mobile.length === 11 && mobile.charAt(0) === '0') mobile = mobile.slice(1);
    if (!/^[6-9]\d{9}$/.test(mobile)) return reply_(false, 'Enter a valid 10-digit mobile number.');
    if (!String(d.name || '').trim()) return reply_(false, 'Enter your name.');
    if (AREAS.indexOf(d.area) === -1) return reply_(false, 'Choose an area.');
    for (var k in ALLOWED) {
      if (d[k] && ALLOWED[k].indexOf(d[k]) === -1) return reply_(false, 'Please check your answers and try again.');
    }

    var tabs = { driver: 'Drivers', rider: 'Riders', fleet: 'Fleet' };
    var need = { driver: ['vehicle_type'], rider: ['ride_type'], fleet: ['org_type', 'size'] };
    var name = tabs[d.type];
    if (!name) return reply_(false, 'Unknown form.');
    for (var n = 0; n < need[d.type].length; n++) {
      if (!String(d[need[d.type][n]] || '').trim()) return reply_(false, 'Please fill in all required answers.');
    }

    var sheet = tab_(name);
    var cols = COLS[name];
    var mobileCol = cols.indexOf('Mobile') + 1;
    if (sheet.getLastRow() > 1) {
      var existing = sheet.getRange(2, mobileCol, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < existing.length; i++) {
        if (String(existing[i][0]).replace(/\D/g, '') === mobile) {
          return reply_(true, "You're already on the list. We'll WhatsApp you before launch.");
        }
      }
    }

    var ts = now_().full;
    var consent = 'Yes (notice ' + String(d.notice || 'v1').slice(0, 10) + ')';
    var vid = cleanId_(d.visit_id);
    var rows = {
      driver: [ts, d.name, mobile, d.vehicle_type, d.ownership, d.area, d.language, consent, d.utm_source, d.utm_medium, d.page, vid],
      rider:  [ts, d.name, mobile, d.area, d.ride_type, consent, d.utm_source, d.utm_medium, d.page, vid],
      fleet:  [ts, d.name, d.company, mobile, d.org_type, d.size, d.area, consent, d.utm_source, d.utm_medium, d.page, vid]
    };
    var row = rows[d.type].map(safe_);
    var next = sheet.getLastRow() + 1;
    sheet.getRange(next, mobileCol).setNumberFormat('@');
    sheet.getRange(next, 1, 1, row.length).setValues([row]);
    return reply_(true, "You're on the list. We'll WhatsApp you before launch.");
  } catch (err) {
    return reply_(false, 'Something went wrong. Please message us on WhatsApp instead.');
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Dashboard: run setupDashboard once from the editor ---------- */

function setupDashboard() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Kolkata');
  Object.keys(COLS).forEach(function (n) { tab_(n); });
  var sh = ss.getSheetByName('Dashboard') || ss.insertSheet('Dashboard', 0);
  sh.clear();
  var f = [];   // [cell, value-or-formula]
  function put(cell, v) { f.push([cell, v]); }

  put('A1', 'ev-go dashboard');
  put('A2', 'Visits are anonymous. Sign-ups are people who submitted a form. All times are IST.');

  // Summary
  put('A4', 'Summary');
  var sum = [
    ['Total visits', '=COUNTA(Visits!$C$2:$C)'],
    ['Unique visitors', '=IFERROR(COUNTA(UNIQUE(FILTER(Visits!$C$2:$C,Visits!$C$2:$C<>""))),0)'],
    ['Driver sign-ups', '=COUNTA(Drivers!$A$2:$A)'],
    ['Rider sign-ups', '=COUNTA(Riders!$A$2:$A)'],
    ['Fleet / business sign-ups', '=COUNTA(Fleet!$A$2:$A)'],
    ['Sign-ups per unique visitor', '=IFERROR((B7+B8+B9)/B6,0)'],
    ['WhatsApp taps', '=COUNTIF(Events!$E$2:$E,"wa_click")'],
    ['Call taps', '=COUNTIF(Events!$E$2:$E,"call_click")'],
    ['Calculator uses (driver + trip)', '=COUNTIF(Events!$E$2:$E,"calc_driver")+COUNTIF(Events!$E$2:$E,"calc_trip")']
  ];
  sum.forEach(function (r, i) { put('A' + (5 + i), r[0]); put('B' + (5 + i), r[1]); });

  // By source
  put('A15', 'By poster / source (utm_source in the QR code)');
  var head = ['Source', 'Visits', 'Unique visitors', 'Driver sign-ups', 'Rider sign-ups', 'Business sign-ups', 'Sign-ups per unique visitor', 'WhatsApp taps', 'Call taps'];
  head.forEach(function (h, i) { put(String.fromCharCode(65 + i) + '16', h); });
  var first = 17;
  SOURCES.forEach(function (s, i) {
    var r = first + i;
    put('A' + r, s);
    put('B' + r, '=COUNTIF(Visits!$D$2:$D,$A' + r + ')');
    put('C' + r, '=IFERROR(COUNTA(UNIQUE(FILTER(Visits!$C$2:$C,Visits!$D$2:$D=$A' + r + '))),0)');
    put('D' + r, '=COUNTIF(Drivers!$I$2:$I,$A' + r + ')');
    put('E' + r, '=COUNTIF(Riders!$G$2:$G,$A' + r + ')');
    put('F' + r, '=COUNTIF(Fleet!$I$2:$I,$A' + r + ')');
    put('G' + r, '=IFERROR((D' + r + '+E' + r + '+F' + r + ')/C' + r + ',0)');
    put('H' + r, '=COUNTIFS(Events!$D$2:$D,$A' + r + ',Events!$E$2:$E,"wa_click")');
    put('I' + r, '=COUNTIFS(Events!$D$2:$D,$A' + r + ',Events!$E$2:$E,"call_click")');
  });
  var last = first + SOURCES.length - 1, other = last + 1;
  put('A' + other, 'other / direct');
  ['B', 'C', 'D', 'E', 'F', 'H', 'I'].forEach(function (c) {
    var total = { B: '$B$5', C: '$B$6', D: '$B$7', E: '$B$8', F: '$B$9', H: '$B$11', I: '$B$12' }[c];
    put(c + other, '=MAX(0,' + total + '-SUM(' + c + first + ':' + c + last + '))');
  });
  put('G' + other, '=IFERROR((D' + other + '+E' + other + '+F' + other + ')/C' + other + ',0)');

  // Last 14 days
  var dayHead = other + 3;
  put('A' + (dayHead - 1), 'Last 14 days');
  ['Date', 'Visits', 'Driver sign-ups', 'Rider sign-ups', 'Business sign-ups'].forEach(function (h, i) { put(String.fromCharCode(65 + i) + dayHead, h); });
  var d0 = dayHead + 1;
  for (var i = 0; i < 14; i++) {
    var r = d0 + i;
    put('A' + r, '=TODAY()-' + (13 - i));
    put('B' + r, '=COUNTIF(Visits!$B$2:$B,TEXT($A' + r + ',"yyyy-mm-dd"))');
    put('C' + r, '=COUNTIF(Drivers!$A$2:$A,TEXT($A' + r + ',"yyyy-mm-dd")&"*")');
    put('D' + r, '=COUNTIF(Riders!$A$2:$A,TEXT($A' + r + ',"yyyy-mm-dd")&"*")');
    put('E' + r, '=COUNTIF(Fleet!$A$2:$A,TEXT($A' + r + ',"yyyy-mm-dd")&"*")');
  }
  var dLast = d0 + 13;

  // Time estimate
  var t = dLast + 3;
  put('A' + (t - 1), 'How long to reach the driver target?');
  put('A' + t, 'Driver target');            put('B' + t, 100);
  put('A' + (t + 1), 'Drivers signed up so far'); put('B' + (t + 1), '=B7');
  put('A' + (t + 2), 'Average driver sign-ups per day (last 7 days)'); put('B' + (t + 2), '=SUM(C' + (dLast - 6) + ':C' + dLast + ')/7');
  put('A' + (t + 3), 'Estimated days left at that pace'); put('B' + (t + 3), '=IF(B' + (t + 1) + '>=B' + t + ',0,IF(B' + (t + 2) + '>0,ROUNDUP((B' + t + '-B' + (t + 1) + ')/B' + (t + 2) + ',0),"not enough data yet"))');
  put('A' + (t + 4), 'Estimated date'); put('B' + (t + 4), '=IF(ISNUMBER(B' + (t + 3) + '),TODAY()+B' + (t + 3) + ',"-")');
  put('A' + (t + 5), 'Driver sign-ups per unique visitor'); put('B' + (t + 5), '=IFERROR(B7/B6,0)');
  put('A' + (t + 6), 'More unique visitors needed at that rate'); put('B' + (t + 6), '=IF(B' + (t + 5) + '>0,MAX(0,ROUNDUP((B' + t + '-B' + (t + 1) + ')/B' + (t + 5) + ',0)),"not enough data yet")');
  put('A' + (t + 7), 'Change the driver target in the yellow cell. Estimates get reliable after about a week of real data.');

  f.forEach(function (p) {
    var c = sh.getRange(p[0]);
    if (typeof p[1] === 'string' && p[1].charAt(0) === '=') c.setFormula(p[1]); else c.setValue(p[1]);
  });

  // Formatting
  sh.getRange('A1').setFontSize(16).setFontWeight('bold');
  ['A4', 'A15', 'A' + (dayHead - 1), 'A' + (t - 1)].forEach(function (a) { sh.getRange(a).setFontWeight('bold').setFontSize(12); });
  sh.getRange('A16:I16').setFontWeight('bold').setBackground('#0B7A4B').setFontColor('#ffffff');
  sh.getRange('A' + dayHead + ':E' + dayHead).setFontWeight('bold').setBackground('#0B7A4B').setFontColor('#ffffff');
  sh.getRange('B10').setNumberFormat('0.0%');
  sh.getRange('G17:G' + other).setNumberFormat('0.0%');
  sh.getRange('A' + d0 + ':A' + dLast).setNumberFormat('ddd d mmm');
  sh.getRange('B' + (t + 2)).setNumberFormat('0.0');
  sh.getRange('B' + (t + 4)).setNumberFormat('d mmm yyyy');
  sh.getRange('B' + (t + 5)).setNumberFormat('0.0%');
  sh.getRange('B' + t).setBackground('#fff2a8');
  sh.getRange('A' + (t + 7)).setFontColor('#595959');
  sh.getRange('A2').setFontColor('#595959');
  sh.setColumnWidth(1, 330);
  for (var c = 2; c <= 9; c++) sh.setColumnWidth(c, 130);
  sh.setFrozenRows(2);
  SpreadsheetApp.flush();
}

/* ---------- Helpers ---------- */

/* Gets a tab, creating it and fixing its header row when needed. */
function tab_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var cols = COLS[name];
  var header = sheet.getLastRow() === 0 ? [] : sheet.getRange(1, 1, 1, cols.length).getValues()[0];
  if (header.join('|') !== cols.join('|')) {
    sheet.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function now_() {
  var d = new Date();
  return { full: Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss'), day: Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd') };
}

function overCap_(cache, key, max, increment) {
  var n = Number(cache.get(key) || 0);
  if (n >= max) return true;
  if (increment !== false) cache.put(key, String(n + 1), 600);
  return false;
}

function cleanId_(v) { var s = String(v || ''); return /^[A-Za-z0-9_-]{6,40}$/.test(s) ? s : ''; }
function cleanSrc_(v) { var s = String(v || '').toLowerCase(); return /^[a-z0-9_-]{1,40}$/.test(s) ? s : ''; }
function cleanHost_(v) { var s = String(v || '').toLowerCase(); return /^[a-z0-9.-]{1,80}$/.test(s) ? s : ''; }

/* Stops spreadsheet formula injection and trims length. */
function safe_(v) {
  var s = String(v == null ? '' : v).slice(0, 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply_(ok, message) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}
