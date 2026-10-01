/**
 * ev-go sign-up capture. Bound to a Google Sheet.
 * Deploy as Web app: Execute as "Me", Who has access "Anyone".
 * Tabs are created automatically: Drivers, Riders, Fleet.
 *
 * After pasting this version: Deploy > Manage deployments > Edit (pencil) > Version: New version > Deploy.
 */

var AREAS = ['HITEC City', 'Madhapur', 'Gachibowli', 'Kondapur', 'Kukatpally', 'Miyapur', 'Ameerpet', 'Other'];
var ALLOWED = {
  vehicle_type: ["E-auto", "E-bike", "E-cab", "I don't have an EV yet"],
  ownership: ['Own', 'Rent', 'Planning to buy'],
  language: ['Telugu', 'Hindi', 'English', 'Urdu'],
  ride_type: ['Office commute', 'Metro first or last mile', 'Airport', 'Other'],
  org_type: ['Fleet owner', 'IT park or company', 'School or hospital']
};
var MAX_SUBMISSIONS_PER_10_MIN = 60;

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var d = JSON.parse(e.postData.contents);

    if (d.website) return reply_(true, "You're on the list. We'll WhatsApp you before launch.");
    if (d.consent !== 'yes') return reply_(false, 'Please tick the box so we can contact you.');

    var cache = CacheService.getScriptCache();
    var count = Number(cache.get('submissions') || 0);
    if (count >= MAX_SUBMISSIONS_PER_10_MIN) return reply_(false, 'We are getting many requests. Please try again in a few minutes or message us on WhatsApp.');

    var mobile = String(d.mobile || '').replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(mobile)) return reply_(false, 'Enter a valid 10-digit mobile number.');
    if (!String(d.name || '').trim()) return reply_(false, 'Enter your name.');
    if (AREAS.indexOf(d.area) === -1) return reply_(false, 'Choose an area.');
    for (var k in ALLOWED) {
      if (d[k] && ALLOWED[k].indexOf(d[k]) === -1) return reply_(false, 'Please check your answers and try again.');
    }

    var layouts = {
      driver: { tab: 'Drivers', cols: ['Timestamp (IST)', 'Name', 'Mobile', 'Vehicle type', 'Ownership', 'Area', 'Language', 'Consent', 'UTM source', 'UTM medium', 'Page'], need: ['vehicle_type'] },
      rider:  { tab: 'Riders',  cols: ['Timestamp (IST)', 'Name', 'Mobile', 'Area', 'Ride type', 'Consent', 'UTM source', 'UTM medium', 'Page'], need: ['ride_type'] },
      fleet:  { tab: 'Fleet',   cols: ['Timestamp (IST)', 'Name', 'Company', 'Mobile', 'Type', 'Size', 'Area', 'Consent', 'UTM source', 'UTM medium', 'Page'], need: ['org_type', 'size'] }
    };
    var layout = layouts[d.type];
    if (!layout) return reply_(false, 'Unknown form.');
    for (var n = 0; n < layout.need.length; n++) {
      if (!String(d[layout.need[n]] || '').trim()) return reply_(false, 'Please fill in all required answers.');
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(layout.tab) || ss.insertSheet(layout.tab);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(layout.cols);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, layout.cols.length).setFontWeight('bold');
    }

    var mobileCol = layout.cols.indexOf('Mobile') + 1;
    if (sheet.getLastRow() > 1) {
      var existing = sheet.getRange(2, mobileCol, sheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < existing.length; i++) {
        if (String(existing[i][0]).replace(/\D/g, '') === mobile) {
          return reply_(true, "You're already on the list. We'll WhatsApp you before launch.");
        }
      }
    }

    var ts = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss');
    var consent = 'Yes (notice ' + String(d.notice || 'v1').slice(0, 10) + ')';
    var rows = {
      driver: [ts, d.name, mobile, d.vehicle_type, d.ownership, d.area, d.language, consent, d.utm_source, d.utm_medium, d.page],
      rider:  [ts, d.name, mobile, d.area, d.ride_type, consent, d.utm_source, d.utm_medium, d.page],
      fleet:  [ts, d.name, d.company, mobile, d.org_type, d.size, d.area, consent, d.utm_source, d.utm_medium, d.page]
    };
    var row = rows[d.type].map(safe_);
    var next = sheet.getLastRow() + 1;
    sheet.getRange(next, mobileCol).setNumberFormat('@');
    sheet.getRange(next, 1, 1, row.length).setValues([row]);

    cache.put('submissions', String(count + 1), 600);
    return reply_(true, "You're on the list. We'll WhatsApp you before launch.");
  } catch (err) {
    return reply_(false, 'Something went wrong. Please message us on WhatsApp instead.');
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return ContentService.createTextOutput('ev-go sign-up endpoint is running.');
}

/* Stops spreadsheet formula injection and trims length. */
function safe_(v) {
  var s = String(v == null ? '' : v).slice(0, 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function reply_(ok, message) {
  return ContentService.createTextOutput(JSON.stringify({ ok: ok, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}
