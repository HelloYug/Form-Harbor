# FormHarbour 🛠️
FormHarbour is a universal Google Apps Script backend for website forms. It
accepts JSON or URL-encoded submissions from multiple websites, stores them in
Google Sheets, and delivers formatted email notifications through a durable
queue.

It is designed for website owners who want a lightweight form backend without
running a separate server or database.

Created and maintained by [Yug Agarwal](https://yugagarwal.dev).

## 🎯 Use cases

- Contact and enquiry forms.
- Sponsorship, support, feedback, and lead forms.
- Multiple domains or subdomains using one backend.
- Separate notification recipients for different websites.
- Optional submitter confirmation emails.
- Honeypot review and bot-submission monitoring.
- Small and medium-volume form workloads backed by Google Sheets.

## 🔄 How the system works

1. A website sends the form data to the deployed Apps Script Web App URL.
2. FormHarbour validates the request, normalizes the hostname, and applies rate limiting.
3. The submission is written to a website sheet with `Timestamp` first, followed by the form fields and protected operational columns.
4. A durable queue record is created for each notification recipient.
5. The Web App returns without waiting for email delivery.
6. The five-minute worker sends queued mail, retries temporary failures, and recovers interrupted work.
7. If a row was saved but queue creation failed, the worker reconstructs the missing queue record from the saved row.

## ✨ Features

- Dynamic Google Forms-style sheet headers.
- Multiline values remain in one cell and one submission row.
- Per-site notification routing through `__FH_SITE_CONFIG`.
- Manual domain grouping, such as `brand.com` and `brand.in` sharing one record sheet.
- Actual incoming hostname preserved in `__fh_source_site` for statistics.
- Compact `fh-` submission IDs for display.
- Protected metadata columns and managed headers.
- Automatic restoration of renamed managed sheets and headers.
- Hidden and protected queue, index, and log sheets.
- Individual recipient delivery instead of exposing recipients through CC/BCC.
- Per-recipient retry state, leases, quota protection, and health diagnostics.
- Optional confirmation email to the submitter.
- Optional frontend saved-data notification.
- Five-day honeypot review window with combined digest emails.
- Formula-injection protection and bounded input validation.
- Local test website and dependency-free automated test suite.

## 📁 Project structure

```text
FormHarbour/
├── Code.gs                         Apps Script backend
├── README.md                       Project overview
├── LICENSE                         MIT license
├── docs/
│   ├── SETUP.md                    Complete deployment and operations guide
│   └── FRONTEND_INTEGRATION.md     Prompts and frontend code recipes
├── tests/
│   └── Code.test.js                Local behavioral test harness
├── samples/
│   └── Form-Harbour.xlsx           Sample workbook with managed FormHarbour tabs
└── test-form/
    ├── index.html                  Browser test form
    ├── app.js                      Test form behavior
    ├── config.js                   Local Web App URL configuration
    └── styles.css                  Test form styling
```

## 📊 Workbook structure

FormHarbour creates and manages these tabs:

| Sheet | Purpose |
|---|---|
| `__FH_SITE_CONFIG` | Website recipients and per-site settings; always first |
| `<submission_sheet>` | Website records with `Timestamp`, fields, and protected metadata |
| `honeypot - <submission_sheet>` | Bot submissions awaiting review |
| `__FH_QUEUE` | Hidden durable notification queue |
| `__FH_INDEX` | Hidden submission index and idempotency reference |
| `__FH_LOG` | Hidden bounded operational log |

## 📄 Sample workbook

The repository includes a sample Google Sheets-compatible workbook:
[samples/Form-Harbour.xlsx](samples/Form-Harbour.xlsx).

It contains example managed tabs for `yugagarwal.dev`, including the site
configuration sheet, website records, honeypot review records, queue, index, and
log tabs. Use it as a visual reference or import a copy into Google Sheets while
learning the system. Do not use the sample workbook as a production destination;
configure your own spreadsheet ID in `Code.gs` and run `setup()` for production.

Website record columns are ordered as:

```text
Timestamp → form fields → __fh_submission_id → __fh_source_site → __fh_notification_status
```

The three `__fh_` columns are protected from manual editing.

## ⚙️ Site configuration

`__FH_SITE_CONFIG` uses this header structure:

| site | notification_emails | enabled | send_confirmation_emails | show_confirmation_notification | submission_sheet |
|---|---|---|---|---|---|
| `example.com` | `admin@example.com` | `TRUE` | `FALSE` | `TRUE` | `example.com` |

New website rows are added automatically with the global fallback recipient and
the default settings. To group aliases manually, set the same
`submission_sheet` value for both domains:

| site | submission_sheet |
|---|---|
| `brand.com` | `brand.com` |
| `brand.in` | `brand.com` |

Both domains then share the record sheet, honeypot sheet, and rate limit, while
`__fh_source_site` shows whether each submission came from `.com` or `.in`.

## ✉️ Confirmation emails

Confirmation emails are disabled by default:

```js
SEND_CONFIRMATION_EMAILS: false
```

When enabled, FormHarbour looks for a valid email address only in the field
names listed in `CONFIRMATION_EMAIL_FIELD_NAMES`. Matching is case-insensitive
and extra spaces are normalized, but the backend does not perform fuzzy matching
automatically.

The default checks only `email`:

```js
CONFIRMATION_EMAIL_FIELD_NAMES: ["email"]
```

If a website uses names such as `mail`, `work mail`, or `email address`, list
them explicitly:

```js
CONFIRMATION_EMAIL_FIELD_NAMES: [
  "email",
  "mail",
  "work mail",
  "work_email",
  "email address"
]
```

The first valid address found is used. If no configured field contains a valid
address, the form row is still saved and administrator notifications continue
normally.

## 🔌 Frontend integration requirements

The existing website and its validation can remain unchanged. Add only the
FormHarbour integration values:

- `_site`: exact hostname, such as `form.yug.dev` or `yug.dev`.
- `_submission_id`: stable ID reused when retrying the same submission.
- `_honeypot`: optional hidden field that must remain empty for genuine users.
- All ordinary form fields, including a normal `<textarea>` for multiline data.

For ready-to-copy prompts and code, see
[Frontend Integration Recipes](docs/FRONTEND_INTEGRATION.md).

## 🚀 Setup and deployment

Use the complete [step-by-step setup guide](docs/SETUP.md). The short version is:

1. Create a separate standalone Apps Script project directly at [script.google.com](https://script.google.com/).
2. Copy `Code.gs` into that project.
3. Extract the destination Spreadsheet ID from its Google Sheets URL.
4. Set `SPREADSHEET_ID` and `NOTIFICATION_EMAILS` in `Code.gs`.
5. Run `setup()` once and authorize the project.
6. Deploy as a Web App running as the project owner.
7. Copy the `/exec` URL into the frontend or local test client.
8. Submit a test form and run `checkSystemHealth()`.

The setup guide also covers authorization, triggers, sheet protections, site
configuration, aliases, honeypots, testing, deployment updates, and recovery.

## 🧪 Local testing

Run the dependency-free test suite from the repository root:

```text
npm test
```

The suite currently contains 36 behavioral scenarios covering:

- 100-submission load bursts.
- Duplicate submissions and idempotency.
- Rate limiting and retry behavior.
- Dynamic headers and multiline values.
- Alias-domain grouping.
- Confirmation emails and honeypots.
- Deferred queue recovery after a simulated queue-write failure.
- Managed-column resizing during setup and scheduled maintenance.

The browser test client is in [test-form/](test-form/). Configure its deployed
URL in [test-form/config.js](test-form/config.js), then run:

```powershell
python -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/` in a browser.

## 🛡️ Reliability and delivery behavior

- Form rows are persisted before notification delivery.
- Normal queue creation completes before the accepted response is returned.
- Deferred rows are scanned and recovered by the worker.
- Managed system columns are resized twice daily, defaulting to 09:00 and 18:00 in the spreadsheet timezone.
- setup() resizes all existing managed sheets, and scheduled maintenance repeats the sizing twice daily.
- Managed headers stay on one line and receive a readable minimum width, so long system names do not collapse into narrow wrapped columns.
- The queue processes up to 25 email attempts per run.
- Temporary delivery failures retry up to five times.
- Processing leases recover work interrupted by an Apps Script execution limit.
- A coalesced safety trigger runs about six minutes after queued work begins.
- Site configuration is cached for two minutes and invalidated after edits.
- The system uses script locks for shared spreadsheet and queue mutations.

Email delivery is asynchronous. A five-minute Apps Script trigger is best effort,
so provider processing, quota limits, temporary errors, and Apps Script load can
add delay.

## 📏 Runtime limits

- 30 requests per normalized hostname in a rolling 60-second window.
- 512 KiB request body.
- 80 fields per request.
- 10,000 characters per field value.
- 20 new managed tabs per hour.
- 5,000 pending notification items.
- 100 deferred website rows scanned per worker run.
- 10,000 queue-history rows.

## ⚠️ Limitations

- Apps Script Web Apps do not provide arbitrary HTTP status codes or guaranteed CORS behavior.
- `_site` is a client-supplied routing hint and can be spoofed without an external trust boundary.
- Exactly-once email delivery cannot be guaranteed; a crash immediately after a successful email send may cause a retry.
- Google Sheets is not intended as unlimited high-volume storage.
- Deleted historical sheets or records cannot be reconstructed automatically.
- Absolute zero-loss guarantees are impossible if Google services, the account, or the workbook become unavailable.

## 🔒 Security and repository safety

- Do not commit Spreadsheet IDs, credentials, private submissions, or deployed URLs that should remain private.
- Keep notification addresses in the Apps Script configuration or site config sheet, not frontend code.
- Never expose the hidden queue, which contains operational recipient state.
- Formula-shaped user values are escaped before being written to Sheets.

## 🔄 After code changes

1. Run `npm test`.
2. Run the project syntax checks from the repository root.
3. Copy the updated `Code.gs` into the standalone Apps Script project.
4. Run `setup()` if triggers, permissions, or managed structures changed.
5. Update the existing Web App deployment while keeping the same `/exec` URL.
6. Submit a live test and run `checkSystemHealth()`.

## 👤 Author

**Yug Agarwal** — code author and maintainer

- Website: [yugagarwal.dev](https://yugagarwal.dev)
- GitHub: [@HelloYug](https://github.com/HelloYug)
- Repository: [FormHarbour](https://github.com/HelloYug/Form-Harbor)

## 📄 License

FormHarbour is released under the [MIT License](LICENSE).
