# ev-go.in setup

Files: `index.html` (the page), `Code.gs` (sign-up capture), this guide.

## 1. Create the Google Sheet (5 minutes)
1. Sign in to Google with jahangeershaik997@gmail.com and create a new Sheet named **ev-go signups**.
2. Open **Extensions > Apps Script**. Delete the sample code and paste all of `Code.gs`. Save.
3. Click **Deploy > New deployment > Select type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy** and approve the permissions (Google will warn that the app is unverified: **Advanced > Go to project**).
5. Copy the **Web app URL**. It ends in `/exec`.
6. In `index.html`, search for `PASTE_DEPLOYMENT_ID_HERE` and replace it with the ID part of that URL (the long text between `/s/` and `/exec`).
7. The Drivers, Riders and Fleet tabs create themselves on the first sign-up.

If you edit `Code.gs` later, use **Deploy > Manage deployments > Edit > New version**, otherwise the live URL keeps running the old code.

## 2. Test before you share
Open `index.html` in a browser, submit each of the three forms with a test number, and check the Sheet. Submit the same number twice to confirm the "already on the list" message. Delete test rows afterwards.

## 3. Host it free on Vercel
1. Create a free account at vercel.com.
2. Create a new project and upload the `ev-go-site` folder (or push it to GitHub and import it).
3. Deploy. You get a `*.vercel.app` link to test.
4. In Project > Settings > Domains, add `ev-go.in` and `www.ev-go.in`.

## 4. Point ev-go.in at it (GoDaddy DNS)
First finish **WHOIS verification** (Validate button on the domain page), or DNS edits may be blocked.

In GoDaddy > ev-go.in > DNS, **edit** the existing records, do not add duplicates:
| Type | Name | Change to |
|---|---|---|
| A | @ | 76.76.21.21 |
| CNAME | www | cname.vercel-dns.com |

Vercel's Domains screen shows the exact values it wants for your project, so use those if they differ. Leave the NS, SOA, `_domainconnect` and `_dmarc` records alone. It usually takes a few minutes to a few hours. HTTPS is issued automatically.

(Netlify works the same way. Use the A record and CNAME target its dashboard shows.)

## 5. Checklist
- [ ] Replace `PASTE_DEPLOYMENT_ID_HERE` in `index.html`
- [ ] WhatsApp number +91 90593 14625 is already set in the page. Change it in `index.html` if you get a separate business number.
- [ ] Complete WHOIS verification for ev-go.in
- [ ] Test all three forms and the duplicate check
- [ ] Add a cookie-free analytics script where the comment says so (optional)
- [ ] Share the link with UTM tags, e.g. `https://ev-go.in/?utm_source=autostand&utm_medium=qr`, so the Sheet shows where sign-ups came from

## Notes
- The page shows the WhatsApp number publicly. Your Gmail address is not on the page.
- The founding offer (30 days free, 25% off for 6 months, first 100 drivers) is written into the page, so only keep it if you will honour it.
- Do a trademark search for "EVgo" before you print vehicle wraps or spend on branding.
