# FormHarbour complete setup guide 🚀

This guide takes you from an empty Google Spreadsheet to a working public form endpoint, notification queue, and local test website.

The backend runs as a Google Apps Script Web App. It stores submissions in Google Sheets and sends notifications through the Google account that owns the deployment. Google’s official references are the [Web Apps guide](https://developers.google.com/apps-script/guides/web) and the [Apps Script authorization guide](https://developers.google.com/apps-script/guides/services/authorization).

## 1. 🧭 What you are setting up

You will have:

- One Google Spreadsheet.
- One Apps Script project containing Code.gs.
- One deployed Web App URL ending in /exec.
- One hidden queue trigger and one spreadsheet-change trigger created by setup().
- One tab per normalized website hostname.
- One separate local test website in test-form/.

The public browser form sends data to the Web App. The script writes the row first, then queues individual email notifications. Honeypot captures remain isolated and are grouped into one unread-review digest after five days unless marked read. The queue worker runs automatically every minute as a recovery path.

## 2. 📊 Create the Google Spreadsheet

1. Sign in to the Google account that should own the backend and send its emails.
2. Open Google Sheets and create a blank spreadsheet, or select an existing spreadsheet dedicated to this form system.
3. Give it a clear name, such as FormHarbour Submissions.
4. Confirm that the account you will use for Apps Script has Editor access.
5. Do not manually create the website tabs or hidden system tabs. The script creates them.

### Extract the Spreadsheet ID from the URL

A spreadsheet URL normally looks like this:

~~~text
https://docs.google.com/spreadsheets/d/1AbCDefGHIjkLMNopQRsTUVwxyz1234567890/edit#gid=0
~~~

The Spreadsheet ID is only the text between /d/ and /edit:

~~~text
1AbCDefGHIjkLMNopQRsTUVwxyz1234567890
~~~

Copy only that ID. Do not paste the complete URL, /edit suffix, #gid value, spaces, or quotation marks into Code.gs.

## 3. 🧩 Create a standalone Apps Script project

FormHarbour uses a separate, standalone Google Apps Script project. The backend
connects to the destination spreadsheet through `CONFIG.SPREADSHEET_ID`.

1. Visit https://script.google.com/.
2. Choose **New project**.
3. Rename the project to FormHarbour Backend.
4. Open the default script file, usually Code.gs.

Keep this project separate from the spreadsheet. The spreadsheet is only the
configured data destination.

## 4. 💻 Add the backend code

1. Open the repository file Code.gs.
2. Copy the complete file contents.
3. Replace all default code in the Apps Script editor.
4. Save the project.
5. Confirm that the editor contains the public functions doPost, setup, testSubmission, processPendingNotifications, and checkSystemHealth.

Do not split the file into separate files unless you also update every referenced helper. The delivered Code.gs is self-contained.

## 5. ⚙️ Configure the backend values

At the top of Code.gs, edit only the public CONFIG object first:

~~~javascript
const CONFIG = {
  SPREADSHEET_ID: "PASTE_THE_ID_ONLY",

  NOTIFICATION_EMAILS: [
    "your-email@gmail.com"
  ],

  SEND_CONFIRMATION_EMAILS: false,

  SHOW_CONFIRMATION_NOTIFICATION: true,

  CONFIRMATION_EMAIL_FIELD_NAMES: ["email"],

  TIMEZONE: "Asia/Kolkata",

  EMAIL_QUOTA_RESERVE_PERCENT: 10
};
~~~

### SPREADSHEET_ID

Replace PASTE_THE_ID_ONLY with the ID extracted in step 2.

Correct:

~~~javascript
SPREADSHEET_ID: "1AbCDefGHIjkLMNopQRsTUVwxyz1234567890"
~~~

Incorrect:

~~~javascript
SPREADSHEET_ID: "https://docs.google.com/spreadsheets/d/1AbC.../edit"
~~~

### NOTIFICATION_EMAILS

One recipient:

~~~javascript
NOTIFICATION_EMAILS: "admin@example.com"
~~~

Multiple recipients:

~~~javascript
NOTIFICATION_EMAILS: [
  "admin@example.com",
  "owner@example.com",
  "team@example.com"
]
~~~

The backend trims whitespace, removes duplicate addresses case-insensitively, excludes invalid addresses, and reports invalid configuration through setup() and checkSystemHealth(). Recipients are sent individually for privacy and independent retry tracking.

Do not add recipient addresses to browser JavaScript. They belong only in Code.gs.

### Per-site notification routing

Run `setup()` once. It creates a visible `__FH_SITE_CONFIG` tab in the same workbook and keeps it as the first sheet tab. Add one row per normalized website hostname:

| site | notification_emails | enabled | send_confirmation_emails | show_confirmation_notification |
|---|---|---|---|---|
| `site-a.com` | `a@example.com, b@example.com, c@example.com` | `TRUE` | `FALSE` | `TRUE` |
| `site-b.com` | `c@example.com; d@example.com; f@example.com` | `TRUE` | `TRUE` | `FALSE` |

Rules:

- Use only the hostname: no `https://`, path, or port.
- Separate recipient addresses with commas, semicolons, or new lines.
- Set `enabled` to `FALSE` to store submissions without sending admin notifications for that site.
- Set `send_confirmation_emails` to `TRUE` to send a saved-data confirmation to a valid configured email field for that site.
- Set `show_confirmation_notification` to `TRUE` or `FALSE` to control the frontend saved-data notice for compatible JavaScript clients.
- Leave either new setting blank to inherit the corresponding global `CONFIG` default.
- A configured site row overrides the global `CONFIG.NOTIFICATION_EMAILS` list.
- A site without a row uses the global list as a backward-compatible fallback.
- The recipient list is captured when the submission is queued; editing the config later affects new submissions, not already-queued mail.
- Honeypot review digests use the same per-site recipient routing.

The site configuration header is protected. Keep one row per hostname; duplicate rows are reported by `checkSystemHealth()` and the first matching row is used.

On a brand-new workbook with no website tab, the sheet contains only the header:

| site | notification_emails | enabled | send_confirmation_emails | show_confirmation_notification |
|---|---|---|---|---|

There are no data rows below this header until a hostname tab is detected or a submission creates one.

The global `CONFIG.NOTIFICATION_EMAILS` list remains the fallback; it is not copied into a blank placeholder row. When the first normal website submission creates a hostname tab, FormHarbour automatically adds that hostname to `__FH_SITE_CONFIG` with the current global recipients, `TRUE`, `FALSE`, and `TRUE` defaults. A manually created hostname-named website tab is also registered by the spreadsheet-change trigger. A honeypot-only submission creates only its separate review tab and continues using the global fallback until a site row is added. Existing rows are never overwritten, so edit the row to assign site-specific recipients and behavior.

The `enabled`, `send_confirmation_emails`, and `show_confirmation_notification` cells on each FormHarbour-created row use `TRUE`/`FALSE` dropdowns. FormHarbour applies validation only to the newly added row, not to the unused rows below it. `enabled = FALSE` stores the submission but disables admin and honeypot-digest notifications for that site; the two independent settings still control submitter confirmation and frontend behavior. Changing a row affects new submissions and newly queued digest work; recipients or confirmation settings already captured in the durable queue are not rewritten.

### Managed sheet names

FormHarbour manages the names and header structures of all tabs it creates: `__FH_SITE_CONFIG`, `__FH_QUEUE`, `__FH_INDEX`, `__FH_LOG`, website hostname tabs, and `honeypot - sitename` tabs. Website, honeypot, and configuration headers are protected, and the hidden queue/index/log sheets are fully protected from non-owner manual edits. The Apps Script owner remains an editor so the backend can update them. If an authorized editor renames one of these tabs or edits a managed header row, the spreadsheet-change trigger restores the expected name and headers by stable sheet ID. Queue workers also reconcile managed structures before processing, so a delayed change trigger does not make the worker use a newly created duplicate system tab. The trigger also keeps `__FH_SITE_CONFIG` as the first tab. Do not delete managed tabs: a deleted tab can be recreated, but its historical data cannot be reconstructed automatically.

### SEND_CONFIRMATION_EMAILS

Set this boolean to control submitter confirmation email delivery. The shipped default is `false`:

~~~javascript
SEND_CONFIRMATION_EMAILS: false
~~~

Set it to `true` to enable confirmation emails. Leave it `false` to keep confirmation emails disabled while form storage and admin notifications remain active. The backend response reports `confirmationStatus: "disabled"` when this switch is off.

### SHOW_CONFIRMATION_NOTIFICATION

The global default is `true`:

~~~javascript
SHOW_CONFIRMATION_NOTIFICATION: true
~~~

This is the fallback for frontend clients. A matching `__FH_SITE_CONFIG` row can override it through `show_confirmation_notification`. JavaScript clients should use the `showConfirmationNotification` boolean returned in accepted and duplicate POST responses. Native form navigation cannot apply a response setting before leaving the page, so use client-side submission handling when a per-site browser notice is required.

### CONFIRMATION_EMAIL_FIELD_NAMES

By default, a valid address submitted in a field named `email` receives a separate confirmation email after the row is saved. If the website uses another field name, change this setting, for example:

~~~javascript
CONFIRMATION_EMAIL_FIELD_NAMES: ["contact_email"]
~~~

The setting controls field names, not recipient addresses. If the configured field is missing or contains an invalid address, the submission is still saved and only the admin notifications are queued.

### What you do not configure

You do not manually create website tabs, list form field names, create triggers, or configure email templates. Website tabs and columns are created automatically. Site-specific recipients are managed in `__FH_SITE_CONFIG` when needed.

## 6. 🔐 Authorize the Apps Script project

1. In the Apps Script editor, select setup from the function dropdown.
2. Click **Run**.
3. Google will show the authorization flow the first time.
4. Choose the Google account that owns the spreadsheet and should send notifications.
5. Review the requested permissions.
6. If Google shows an unverified-app warning for your personal script, choose **Advanced**, then choose the option to continue to your project only if you trust the code you pasted.
7. Click **Allow**.

The script needs authorization for:

- Reading and writing the configured spreadsheet.
- Sending mail through MailApp.
- Creating and managing the queue trigger.
- Storing durable state in Script Properties.
- Using CacheService for best-effort throttling.

Apps Script determines many scopes by scanning the code. If you later add a service or change permissions, run a function manually in the editor again so the owner can authorize the new scope.

### What setup() creates

After successful authorization, setup():

- Validates the Spreadsheet ID.
- Creates hidden __FH_QUEUE, __FH_INDEX, and __FH_LOG tabs plus the visible __FH_SITE_CONFIG routing tab.
- Normalizes notification recipients.
- Sets the spreadsheet timezone to Asia/Kolkata when permitted.
- Creates one processPendingNotifications time-driven trigger every minute.
- Creates one spreadsheet-change trigger that restores managed tab names, managed header rows, and the first-tab position if they are edited.
- Avoids duplicate triggers when setup() is run again.

The script does not automatically deploy the Web App. Deployment remains a manual Apps Script editor step.

The Apps Script function dropdown should contain only these five manual entry points:

- doPost — Web App handler; do not run manually.
- setup — authorization, system tabs, and trigger initialization.
- testSubmission — safe validation dry-run.
- processPendingNotifications — manual queue processing.
- checkSystemHealth — administrator diagnostics.

Internal helper functions are kept out of the editor’s manual function list.

If the editor still shows a long helper-function list, the Apps Script project
is still using an older copy of `Code.gs`. Replace the project file with the
current repository version, save it, and reload the Apps Script editor. No new
deployment is required just to refresh this function list.

## 7. 🧪 Check setup before deployment

Run testSubmission() from the Apps Script editor.

This is a validation dry-run. It does not create a production row and does not send email.

Then run checkSystemHealth(). Review the returned object and execution log. A healthy setup should show:

- ok: true
- The expected spreadsheet name.
- One notification trigger after setup().
- One spreadsheet-change trigger for restoring website names and headers.
- The configured valid recipient count.
- No unexpected setup errors.

If setup() fails, fix that error before deploying.

## 8. 🚀 Deploy the Web App

1. In Apps Script, click **Deploy → New deployment**.
2. Beside **Select type**, choose **Web app**.
3. Set **Execute as** to **Me**, meaning the owner/deployer account.
4. Set **Who has access** to the audience that should submit forms.
   - For a public website, choose the public/anonymous option available in your account, commonly **Anyone**.
   - If you choose a restricted option, visitors without access will not be able to submit.
5. Add an optional description such as FormHarbour production endpoint.
6. Click **Deploy**.
7. Complete any additional authorization prompt.
8. Copy the Web App URL.

The production URL ends in /exec and looks similar to:

~~~text
https://script.google.com/macros/s/DEPLOYMENT_ID/exec
~~~

Use the /exec URL in real forms.

Do not use the /dev URL for your public website. A /dev test deployment is intended for development and is restricted to users who can edit the Apps Script project; it always runs the latest saved code.

Google’s official Web Apps documentation describes the current deployment flow and the difference between /exec and /dev:

https://developers.google.com/apps-script/guides/web

## 9. 🖥️ Configure and use the local test website

The local test website is in test-form/.

1. Open test-form/config.js.
2. Replace EXEC_URL with the deployed /exec URL:

~~~javascript
window.FORMHARBOUR_CONFIG = Object.freeze({
  EXEC_URL: "https://script.google.com/macros/s/DEPLOYMENT_ID/exec",
  SITE_OVERRIDE: "",
  SHOW_CONFIRMATION_NOTIFICATION: true
});
~~~

3. If you are running locally on localhost or through file://, set SITE_OVERRIDE to a valid hostname:

~~~javascript
SITE_OVERRIDE: "test.example.com"
~~~

The backend intentionally rejects localhost as a website identifier. On a real hosted domain, leave SITE_OVERRIDE empty so the test client uses window.location.hostname automatically.

Set `SHOW_CONFIRMATION_NOTIFICATION` to `false` if this frontend should not display the browser-level “Submission stored” notice after a successful response. This only controls the frontend message; it does not disable backend saving, admin email, or submitter confirmation email delivery.

4. Start a static server from the test-form folder:

~~~text
cd test-form
python -m http.server 4173 --bind 127.0.0.1
~~~

5. Open http://127.0.0.1:4173 in a browser. Binding to `127.0.0.1` keeps the local server on IPv4 and avoids the `[::]` IPv6 wildcard display.
6. Enter a name, email, and message.
7. Click **Send test submission**.
8. Confirm the JSON result shown by the page, then inspect the spreadsheet and email.

The test form automatically sends:

- _site: the exact hostname or configured local override.
- _submission_id: a new unique ID for each deliberate submit.
- _honeypot: an empty spam-trap field.

The visible fields demonstrate ordinary dynamic form fields: name, email, phone, subject, and message.

UUID-shaped `_submission_id` values are compacted before being written to the website tab, for example `fh-3a8f1c2d9b7e4a10`. The original client value is still used for idempotency, so retrying the same form submission remains safe.

If the browser reports a cross-origin response problem, do not immediately submit repeatedly. First check whether a new row and email exist. Apps Script may receive the simple POST while the browser is unable to read the redirected response.

## 10. 🔌 Connect a real website form

Assume the website and its form already exist, including all visible fields, styling, layout, and field validation. Do not rebuild or replace that form. Add only the FormHarbour integration pieces below to the existing form.

Set the existing form's action to the deployed /exec URL. Add these hidden integration fields inside the existing form. Keep all existing visible controls and their document order unchanged:

~~~html
<input type="hidden" name="_site" id="form-site">
<input type="hidden" name="_submission_id" id="form-submission-id">
<input class="honeypot-field" type="text" name="_honeypot" tabindex="-1"
       autocomplete="off" aria-hidden="true">
~~~

Add this class to the existing stylesheet so the field stays in the submitted
DOM without appearing to normal visitors:

~~~css
.honeypot-field {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
  opacity: 0;
  pointer-events: none;
}
~~~

Use an external JavaScript file to populate the integration fields:

~~~javascript
document.getElementById("form-site").value = window.location.hostname;
document.getElementById("form-submission-id").value =
  window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(16).slice(2);
~~~

### Frontend integration recipes

Assume the website and form are already built with the user's own fields, styling, validation, and submit behavior. The recipes add only FormHarbour integration requirements; they do not ask you to rebuild the form.

The complete copy-ready prompt and code recipes are in [FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md). Use the section that matches your frontend requirement:

1. [Connect the form endpoint](FRONTEND_INTEGRATION.md#1-connect-the-form-endpoint)
2. [Pick the website name automatically](FRONTEND_INTEGRATION.md#2-pick-the-website-name-automatically)
3. [Generate a duplicate-safe submission ID](FRONTEND_INTEGRATION.md#3-generate-a-duplicate-safe-submission-id)
4. [Add the spam honeypot](FRONTEND_INTEGRATION.md#4-add-the-spam-honeypot)
5. [Show a frontend data-saved notification](FRONTEND_INTEGRATION.md#5-show-a-frontend-data-saved-notification)
6. [Enable the saved-data confirmation email](FRONTEND_INTEGRATION.md#6-enable-the-saved-data-confirmation-email)
7. [Use JSON from a same-origin or compatible client](FRONTEND_INTEGRATION.md#7-use-json-from-a-same-origin-or-compatible-client)
8. [Handle response statuses and safe retries](FRONTEND_INTEGRATION.md#8-handle-response-statuses-and-safe-retries)

The recipes also explain which settings belong in frontend code and which must remain private in Code.gs.

### Website-name behavior

- example.com becomes the example.com tab.
- www.example.com is normalized to example.com.
- blog.example.com remains a separate tab.
- The hostname is a routing hint, not authentication. A public browser can spoof it.
- Do not put https://, a port, a path, or a full page URL in _site.
- If JavaScript is unavailable, set _site manually to the hostname only.

No field registration is needed. Any new form control becomes a new column for that website on the next accepted submission. `Timestamp`, `_site`, `_submission_id`, `_honeypot`, `__fh_submission_id`, `__fh_source_site`, and `__fh_notification_status` are reserved names and cannot be used as ordinary user fields.

### Programmatic JSON clients

JSON clients can send:

~~~javascript
fetch("PASTE_YOUR_EXEC_URL_HERE", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    _site: window.location.hostname,
    _submission_id: crypto.randomUUID(),
    name: "Ada",
    email: "ada@example.com",
    message: "Hello"
  })
});
~~~

Apps Script Web Apps do not provide arbitrary response headers, custom status-code control, or a general doOptions() CORS handler. A cross-origin fetch may therefore be unable to read the response even when the server received the POST. Native form navigation or a same-origin server-side proxy is more reliable when response-readable CORS is required.

### Response contract

Clients should inspect the JSON body rather than relying only on the HTTP status:

| `status` | Common `code` | Meaning |
|---|---|---|
| `accepted` | `stored` | The row was saved; notification work may be `queued`, `processing`, or deferred. |
| `duplicate` | `already_accepted` | The same submission ID and payload were already accepted; keep the same ID and do not create another row. |
| `rejected` | `spam_rejected`, `submission_id_reused`, `invalid_site`, or validation code | The request was not accepted and should not be blindly retried. |
| `retryable` | `lock_unavailable`, `rate_limited`, `site_capacity`, or temporary service code | Keep the same submission ID and retry later with backoff. |
| `failed` | `unexpected_error` or storage failure code | Inspect Apps Script logs and `checkSystemHealth()` before retrying. |

An accepted response can initially report `notificationStatus: "processing"` because FormHarbour attempts up to five recipients immediately after persistence. A queued or deferred notification does not mean the submitted row was lost.

## 11. 📋 Expected spreadsheet result

For a submission from example.com, the script creates a tab named example.com.

The website tab order is:

1. Timestamp — full date and time in Asia/Kolkata with seconds.
2. User fields — for example name, email, phone, subject, and message.
3. Reserved operational columns:
   - __fh_submission_id
   - __fh_source_site
   - __fh_notification_status

For a new website tab, URL-encoded form submissions are read in the original wire/control order before the sheet headers are created. The local test form therefore creates `Timestamp`, `name`, `email`, `phone`, `subject`, `message`, and then the reserved operational columns. Existing tabs retain their established user-field order to protect historical data.

The three __fh_ columns are automatically protected from manual edits whenever a website tab is created or its schema changes. The script owner remains an editor so persistence and notification status updates continue to work. Running setup() also protects matching columns on existing website tabs.

The header row of each website tab is also protected. The backend remembers each tab by its stable Google Sheets ID. If a tab is renamed or its headers are edited by an authorized editor, the spreadsheet-change trigger restores the expected tab name and header row. New form fields remain supported because the backend updates the remembered structure as part of its normal schema-evolution pass.

If a field is missing from a later submission, its cell remains blank. If a new field appears, its column is added before the reserved operational columns. If an older tab used the previous metadata-first layout, the next accepted submission migrates it by header name while preserving row values.

### Honeypot captures

If `_honeypot` is present and contains a non-blank value, FormHarbour rejects the request as spam and does not write it to the normal website tab. For review, it creates or reuses a separate tab named `honeypot - sitename`, for example `honeypot - example.com`.

The honeypot tab uses `Timestamp` as its first column and then stores the received fields in their original order, including `_site`, `_submission_id`, and `_honeypot`. It also adds protected `__fh_honeypot_mailed_status`, `__fh_honeypot_window_id`, and `__fh_honeypot_window_deadline` columns plus an editable `__fh_honeypot_read_status` column with an `Unread`/`Read` chip dropdown for every record. Its header row and system-managed columns are protected, and the tab name/header structure is restored by the same spreadsheet-change trigger used for website tabs. Honeypot captures still follow the request-size, field-size, rate-limit, and sheet-creation limits.

The first honeypot record for a website starts a five-day review window. Additional records for that website during the window are grouped with it. Marking records as `Read` within the window prevents a honeypot email. If unread records remain at the deadline, the queue sends one combined digest for that website/window and updates their mailed status. Genuine submission emails sent during an active window include the current unread honeypot count and a link to the honeypot sheet.

#### Test the honeypot safely

Use a disposable test submission and deliberately send a value in `_honeypot`. Do not fill this field during normal visitor testing.

From PowerShell, replace the URL below with the `/exec` URL in `test-form/config.js`:

~~~powershell
$body = @{
  _site = 'test.example.com'
  _submission_id = "honeypot-test-$([guid]::NewGuid())"
  _honeypot = 'formharbour-honeypot-test'
  name = 'Honeypot Test'
  email = 'honeypot-test@example.com'
  message = 'This record should be isolated.'
}

(Invoke-WebRequest `
  -Uri 'PASTE_YOUR_EXEC_URL_HERE' `
  -Method Post `
  -Body $body `
  -ContentType 'application/x-www-form-urlencoded').Content
~~~

Expected response fields include:

- `status: "rejected"`
- `code: "spam_rejected"`
- `retryable: false`

Then verify that:

1. A `honeypot - test.example.com` tab contains the test row.
2. The normal `test.example.com` tab does not contain that row.
3. No immediate notification email was sent for the honeypot request.
4. Mark the row’s read-status dropdown as `Read`, run `processPendingNotifications()`, and confirm that mailed status becomes `Not required`.
5. For a full digest test, create multiple honeypots, make their window deadline past, run `processPendingNotifications()`, and confirm one combined digest plus `Mailed` statuses.

The honeypot capture tab is the expected audit result; rejection is not a system failure.

Do not rename or delete the managed tabs. Do not grant general viewers access to the hidden __FH_* tabs because the queue contains operational recipient state.

## 12. ✉️ Expected notification email

The email is sent after the spreadsheet row is persisted.

Submitter confirmations are controlled independently by `SEND_CONFIRMATION_EMAILS`. When enabled, a valid address in the configured confirmation field receives the saved-data message. When disabled, only the configured admin notifications are sent.

It contains:

- Sender display name: FormHarbour Notifications.
- Subject: New Form Submission | website-hostname.
- Website name.
- Submission ID.
- Timestamp in IST.
- Every submitted user field and value.
- Blank values marked explicitly.
- HTML and plain-text versions.

Each valid configured recipient receives an individual message. Recipients do not see one another in a shared To/Cc/Bcc list.

When the form includes a valid configured confirmation email field, that submitter also receives a separate message:

- Subject: Submission saved | website-hostname.
- Clear saved/submission confirmation heading.
- Website name and saved timestamp in IST.
- Submission ID.
- Every submitted user field and value.

The confirmation is sent only after the spreadsheet row exists. It is tracked as an independent queue recipient, so a failed confirmation does not prevent admin notifications and a failed admin notification does not prevent the confirmation retry.

## 13. 🧱 Queue, rate limits, and recovery

After a successful save, doPost immediately attempts up to five queued recipients, prioritizing the submitter confirmation when one is configured. The website response may show notificationStatus or confirmationStatus as processing while the remaining recipients stay in the durable queue. The one-minute trigger is the backup for remaining recipients, quota delays, retries, and due honeypot review digests.

The one-minute trigger is best-effort scheduling by Apps Script, not a guaranteed one-minute delivery SLA. Gmail/provider processing, quota limits, temporary failures, and Apps Script load can still add delay.

If the immediate attempt cannot send, the form row is still accepted and the queue remains durable.

If MailApp quota is exhausted:

- The form row remains stored.
- The queue remains pending.
- The worker waits for available quota.
- New submissions continue to be stored subject to resource limits.

The worker sends one recipient at a time, uses leases to recover interrupted runs, and retries temporary failures with bounded exponential backoff and jitter.

Run processPendingNotifications() manually when testing or when you want to process the queue immediately.

Run checkSystemHealth() to inspect pending notifications, failed notifications, trigger count, recipient diagnostics, remaining MailApp recipient quota, and recent useful errors.

MailApp quota is account-wide and can be affected by other scripts or manual activity. The application reserve is conservative but cannot guarantee an account-wide reservation.

### Runtime limits

These limits are built into `Code.gs` and are intentionally kept out of the public `CONFIG` object:

| Area | Default limit or behavior |
|---|---|
| Request body | 512 KiB maximum |
| Fields | 80 fields per request; each field name up to 120 characters |
| Field values | 10,000 characters per value; repeated form keys are preserved as separate values |
| Website hostname | 253 characters; URLs, paths, ports, and invalid hostnames are rejected |
| Rate limiting | 30 requests per normalized hostname in a 60-second CacheService window |
| New tabs | 20 new managed tabs per hour across website and honeypot tabs |
| Pending queue | 5,000 pending notification items; queue history is capped at 10,000 rows |
| Immediate delivery | Up to 5 queued recipients are attempted after a successful save |
| Worker delivery | Up to 25 email attempts per run or a four-minute worker budget |
| Retry behavior | Temporary recipient failures retry up to 5 times with bounded exponential backoff and jitter |
| Processing lease | A claimed recipient lease lasts 10 minutes before another worker can recover it |
| Idempotency | Records are retained for 14 days, with a maximum of 3,000 records |
| Operational log | The diagnostic log is retained at a maximum of 1,200 rows |
| Mail content | Individual values are capped at 12,000 characters and each generated email at 60,000 characters |

The rate limiter is best-effort because it uses `CacheService`; it is not an IP firewall and `_site` is a client-supplied routing hint. A request over the hostname limit returns `status: "retryable"`, `code: "rate_limited"`, and `retryable: true`. A temporary lock or capacity failure is also retryable. The backend never reports a stored submission until the Sheet row has been written.

### Concurrency and failure recovery

`LockService.getScriptLock()` protects shared spreadsheet, idempotency, queue-counter, and quota-accounting mutations. The lock waits up to five seconds. Mail sending happens after the lock is released, so slow mail providers do not hold up form storage. Queue recipient claims use leases; expired `processing` claims become recoverable. The queue tracks each recipient independently, allowing one failed address to retry without resending already successful recipients.

Exactly-once email delivery cannot be guaranteed: if the Apps Script execution crashes after `MailApp.sendEmail()` succeeds but before the queue state is finalized, that recipient may be attempted again. `checkSystemHealth()` exposes pending counts, queue statuses, trigger counts, quota, configuration diagnostics, and recent operational errors.

## 14. 🔄 Updating the backend

1. Edit Code.gs locally.
2. Run the local automated suite from the repository root:

~~~text
npm test
~~~

3. Run the Apps Script editor’s setup() again if configuration, triggers, or permissions changed.
4. Save the Apps Script project.
5. Choose **Deploy → Manage deployments**.
6. Select the existing Web App deployment and choose **Edit**.
7. Create/select a new version and deploy the update.
8. Keep using the same /exec URL.
9. Submit a test form and run checkSystemHealth().

Do not create a separate deployment for every code edit unless you intentionally need a separate endpoint. Updating the existing deployment keeps integrations pointed at the same URL.

## 15. 🩺 Troubleshooting

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| The script says Spreadsheet ID is not configured | Placeholder or full URL was pasted | Copy only the text between /d/ and /edit |
| Authorization required | The owner has not authorized a new service/scope | Run setup() manually in the editor and approve access |
| The form says invalid site | _site is missing, contains a full URL, or is localhost | Send only a hostname; use SITE_OVERRIDE for local testing |
| The response says rate_limited | More than 30 requests arrived for that normalized hostname within the current 60-second window | Stop repeated retries, keep the same submission ID, and retry later with backoff |
| The /exec URL returns an access error | Deployment audience is restricted | Edit the Web App deployment access setting |
| /dev works but /exec does not | /dev is an editor-only test deployment | Deploy the Web App and use /exec |
| Row is stored but mail is not immediate | Mail quota or queue trigger delay | Run processPendingNotifications() and checkSystemHealth() |
| No mail is sent after running processPendingNotifications() | MailApp authorization, invalid recipients, or quota failure | Run setup(), inspect invalid recipient diagnostics, check remaining quota, and review Apps Script executions |
| Invalid recipient warning | One or more configured addresses failed validation | Correct NOTIFICATION_EMAILS and run setup() again |
| Duplicate row after retry | The client did not keep the same _submission_id | Generate one ID per deliberate submission and reuse it only for retries |
| Browser reports CORS failure | Apps Script cannot expose the response to that origin | Check Sheets/email before retrying; use native form navigation or a same-origin proxy |
| Website tab is missing | Storage/lock/sheet-limit failure | Inspect the JSON response and Apps Script execution log; retry only when marked retryable |
| Trigger is missing | It was deleted or authorization changed | Run setup() again and verify checkSystemHealth() |
| A site is missing from __FH_SITE_CONFIG | The hostname tab has not been detected yet or the change trigger is delayed | Run setup() or handleSpreadsheetChange(); new hostname tabs receive the global fallback automatically |
| Website tab name or header changed | An authorized editor changed protected structure | Wait for the change trigger or run setup(); the saved name/header structure will be restored |
| Test client shows Add the Web App URL | config.js still contains the placeholder | Replace EXEC_URL with the deployed /exec URL |

## 16. 🔒 Security and operational checklist

- Keep Spreadsheet sharing limited to people who need it.
- Keep notification recipient addresses in Code.gs only.
- Never put a secret in public website JavaScript.
- Treat _site as an untrusted routing hint.
- Do not expose __FH_QUEUE, __FH_INDEX, or __FH_LOG to general viewers.
- Do not log raw request bodies or confidential form data.
- Use a dedicated Google account or spreadsheet if the form contains sensitive information.
- Review notification quota and queue health periodically.
- Keep a backup/export strategy for high-volume historical submissions because Sheets is not unlimited storage.

## 17. ✅ Final go-live checklist

- [ ] Spreadsheet created and ID copied correctly.
- [ ] SPREADSHEET_ID configured with the ID only.
- [ ] NOTIFICATION_EMAILS configured with at least one valid address.
- [ ] setup() completed successfully.
- [ ] Authorization granted to the correct owner account.
- [ ] Hidden system tabs created.
- [ ] __FH_SITE_CONFIG is the first tab; it may contain only headers until the first website submission.
- [ ] Exactly one queue trigger and one spreadsheet-change trigger exist.
- [ ] testSubmission() passed.
- [ ] Web App deployed as the owner with the intended access setting.
- [ ] /exec URL copied, not /dev.
- [ ] test-form/config.js updated.
- [ ] A test row appears in the expected website tab.
- [ ] A formatted notification email arrives.
- [ ] checkSystemHealth() reports no important errors.
- [ ] Real website forms send _site as the hostname and a stable _submission_id per retry.
- [ ] Managed tab names and header rows are left unchanged by editors.
