# FormHarbour Google Apps Script backend

[![Tests](https://github.com/HelloYug/Form-Harbor/actions/workflows/test.yml/badge.svg)](https://github.com/HelloYug/Form-Harbor/actions/workflows/test.yml)

FormHarbour is a universal Google Apps Script form backend. It receives forms from multiple websites, creates one Google Sheet tab per hostname, stores rows in Google Forms-style order, and delivers formatted email notifications through a durable queue.

## Start here

This repository contains the source backend and a local browser test client. It
does not include a live Spreadsheet ID, notification address, or deployed Web
App URL. Configure those placeholders locally by following the setup guide
before running the backend.

Use the complete [step-by-step setup guide](docs/SETUP.md). It covers Spreadsheet ID extraction, configuration, authorization, deployment, frontend integration, testing, triggers, email behavior, sheet protections, and troubleshooting.

For copy-ready frontend prompts and code, see [Frontend Integration Recipes](docs/FRONTEND_INTEGRATION.md).

Quick overview:

1. Configure SPREADSHEET_ID and NOTIFICATION_EMAILS in Code.gs.
2. Keep SEND_CONFIRMATION_EMAILS false unless submitter confirmation emails are required.
3. Run setup() once in Apps Script and authorize the project.
4. Deploy the project as a Web App running as the owner, then use the /exec URL.
5. Add _site, _submission_id, and _honeypot to each website form.
6. Submit a test form and run checkSystemHealth().

## Default settings

- SEND_CONFIRMATION_EMAILS: false
- CONFIRMATION_EMAIL_FIELD_NAMES: ["email"]
- SHOW_CONFIRMATION_NOTIFICATION: true in test-form/config.js
- Immediate delivery attempts up to five queued recipients.
- The recovery notification trigger runs every minute.

## What the backend provides

- Timestamp first, followed by form fields in first-submission order, then protected operational columns.
- Dynamic schema evolution without losing existing row values.
- Protected __fh_submission_id, __fh_source_site, and __fh_notification_status columns.
- Protected website headers and automatic restoration of renamed website tabs.
- Duplicate-safe submission handling with compact displayed IDs.
- Formatted HTML/plain-text admin notifications and optional submitter confirmations.
- Per-recipient retries, quota protection, leases, health diagnostics, and separate honeypot capture tabs.
- The local test form preserves its submission ID when a request must be retried.
- The test client uses one transparent `formharbour-logo.png` asset for both the visible logo and favicon.
- Formula-injection protection and bounded input validation.

## Test locally

Run the dependency-free test suite from the repository root:

~~~text
npm test
~~~

The suite currently covers 17 behavioral scenarios.

The manual browser client is in [test-form/](test-form/). It presents the FormHarbour brand with “by Yug Agarwal” attribution, links to [yugagarwal.dev](https://yugagarwal.dev), and includes a GitHub repository button. Configure its deployed URL in [test-form/config.js](test-form/config.js), then run `python -m http.server 4173 --bind 127.0.0.1` from that folder and open `http://127.0.0.1:4173/`.

## Important files

- [Code.gs](Code.gs) — self-contained Apps Script backend.
- [docs/SETUP.md](docs/SETUP.md) — complete installation and operations guide.
- [docs/FRONTEND_INTEGRATION.md](docs/FRONTEND_INTEGRATION.md) — frontend prompts and code recipes.
- [tests/Code.test.js](tests/Code.test.js) — local behavioral test harness.
- [test-form/](test-form/) — small browser test client.

## GitHub safety

- Keep `SPREADSHEET_ID` and `NOTIFICATION_EMAILS` configured only for your own Apps Script copy.
- Keep the deployed `/exec` URL configured only in your local `test-form/config.js` when appropriate.
- Never commit Google credentials, private form submissions, exported spreadsheets, or other secrets.
- The local test suite is intentionally included so changes can be checked before copying `Code.gs` into Apps Script.

## After code changes

Run npm test, copy the updated Code.gs into Apps Script, run setup() if triggers or permissions changed, and update the existing Web App deployment. Keep using the same /exec URL.

Live authorization, Google Sheets behavior, Apps Script trigger timing, and MailApp delivery must still be verified once in the target Google account.
