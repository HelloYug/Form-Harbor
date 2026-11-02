# FormHarbour Google Apps Script backend 🛠️

[![Tests](https://github.com/HelloYug/Form-Harbor/actions/workflows/test.yml/badge.svg)](https://github.com/HelloYug/Form-Harbor/actions/workflows/test.yml)

FormHarbour is a universal Google Apps Script form backend. It receives forms from multiple websites, creates one Google Sheet tab per hostname, stores rows in Google Forms-style order, and delivers formatted email notifications through a durable queue.

Created and maintained by [Yug Agarwal](https://yugagarwal.dev). Source code is available under the [MIT License](LICENSE).

## 🚀 Start here

This repository contains the source backend and a local browser test client. It
does not include a live Spreadsheet ID, notification address, or deployed Web
App URL. Configure those placeholders locally by following the setup guide
before running the backend.

Use the complete [step-by-step setup guide](docs/SETUP.md). It covers Spreadsheet ID extraction, configuration, authorization, deployment, frontend integration, testing, triggers, email behavior, sheet protections, and troubleshooting.

For copy-ready frontend prompts and code, see [Frontend Integration Recipes](docs/FRONTEND_INTEGRATION.md).

Quick overview:

1. Create a separate standalone Apps Script project directly at [script.google.com](https://script.google.com/).
2. Configure SPREADSHEET_ID and NOTIFICATION_EMAILS in Code.gs.
3. Keep SEND_CONFIRMATION_EMAILS false unless submitter confirmation emails are required.
4. Run setup() once in Apps Script and authorize the project.
5. Deploy the project as a Web App running as the owner, then use the /exec URL.
6. Add _site, _submission_id, and _honeypot to each existing website form.
7. Submit a test form, inspect the generated site configuration row, and run checkSystemHealth().

## ⚙️ Default settings

- SEND_CONFIRMATION_EMAILS: false
- CONFIRMATION_EMAIL_FIELD_NAMES: ["email"]
- SHOW_CONFIRMATION_NOTIFICATION: true in test-form/config.js
- Immediate delivery attempts up to five queued recipients.
- The recovery notification trigger runs every minute.
- `__FH_SITE_CONFIG` stays as the first workbook tab and provides per-website recipients, with global `CONFIG.NOTIFICATION_EMAILS` as fallback.
- On a brand-new workbook, `__FH_SITE_CONFIG` starts with only its header row. The first website submission automatically adds that hostname with the global recipients and `TRUE` enabled status.

## ✨ What the backend provides

- Timestamp first, followed by form fields in first-submission order, then protected operational columns.
- Dynamic schema evolution without losing existing row values.
- Protected __fh_submission_id, __fh_source_site, and __fh_notification_status columns.
- Protected website headers and automatic restoration of renamed website tabs.
- System-created tabs are automatically restored to their managed names if renamed.
- Internal queue, index, and log sheets are hidden and protected from non-owner manual edits.
- `__FH_SITE_CONFIG` automatically registers new hostname tabs and lets each site override or disable its recipients.
- Duplicate-safe submission handling with compact displayed IDs.
- Formatted HTML/plain-text admin notifications and optional submitter confirmations.
- Per-recipient retries, quota protection, leases, health diagnostics, and separate honeypot capture tabs with five-day unread review digests.
- Script locking, hostname rate limiting, bounded sheet/queue growth, and safe retryable responses for temporary failures.
- Queue workers reconcile managed sheet names before cleanup, digest creation, claiming, and final delivery.
- The local test form preserves its submission ID when a request must be retried.
- The test client uses one transparent `formharbour-logo.png` asset for both the visible logo and favicon.
- Formula-injection protection and bounded input validation.

## 🧪 Test locally

Run the dependency-free test suite from the repository root:

~~~text
npm test
~~~

The suite currently covers 22 behavioral scenarios.

The manual browser client is in [test-form/](test-form/). It presents the FormHarbour brand with “by Yug Agarwal” attribution, links to [yugagarwal.dev](https://yugagarwal.dev), and includes a GitHub repository button. Configure its deployed URL in [test-form/config.js](test-form/config.js), then run `python -m http.server 4173 --bind 127.0.0.1` from that folder and open `http://127.0.0.1:4173/`.

## 📁 Important files

- [Code.gs](Code.gs) — self-contained Apps Script backend.
- [docs/SETUP.md](docs/SETUP.md) — complete installation and operations guide.
- [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md) — frontend prompts and code recipes.
- [tests/Code.test.js](tests/Code.test.js) — local behavioral test harness.
- [test-form/](test-form/) — small browser test client.

## 🔒 GitHub safety

- Keep `SPREADSHEET_ID` and `NOTIFICATION_EMAILS` configured only for your own Apps Script copy.
- Keep the deployed `/exec` URL configured only in your local `test-form/config.js` when appropriate.
- Never commit Google credentials, private form submissions, exported spreadsheets, or other secrets.
- The local test suite is intentionally included so changes can be checked before copying `Code.gs` into Apps Script.

## 👤 Author

**Yug Agarwal** — code author and maintainer

- Website: [yugagarwal.dev](https://yugagarwal.dev)
- GitHub: [@HelloYug](https://github.com/HelloYug)
- Project: [FormHarbour](https://github.com/HelloYug/Form-Harbor)

## 📄 License

FormHarbour is licensed under the [MIT License](LICENSE).

## 🔄 After code changes

Run npm test, copy the updated Code.gs into Apps Script, run setup() if triggers or permissions changed, and update the existing Web App deployment. Keep using the same /exec URL.

Live authorization, Google Sheets behavior, Apps Script trigger timing, and MailApp delivery must still be verified once in the target Google account.

## 🧱 Runtime limits and delivery behavior

The backend uses conservative built-in limits to protect a Spreadsheet-backed deployment:

- At most 30 requests per hostname in a rolling 60-second cache window.
- Request body: 512 KiB maximum; 80 fields maximum; 120-character field names; 10,000 characters per field value.
- At most 20 new website/honeypot tabs per hour and 5,000 pending notification items.
- Up to five queued recipients are attempted immediately after persistence; the recovery worker processes at most 25 emails per run and runs every minute on a best-effort Apps Script schedule.
- Temporary mail failures retry up to five times with backoff; processing leases expire after 10 minutes so interrupted work can be recovered.

The script lock protects shared Sheets, queue, idempotency, and quota state during mutations. Mail is sent after the lock is released. A crash immediately after a successful mail send can still produce a duplicate retry because exactly-once email delivery is not possible with MailApp.

See [the setup guide](docs/SETUP.md#13-queue-rate-limits-and-recovery) for the complete operational limits and response behavior.
