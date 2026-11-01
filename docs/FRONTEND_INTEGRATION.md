# FormHarbour Frontend Integration Recipes

This document contains copy-ready prompts and code for integrating FormHarbour into an already-built website and form.

The existing form is assumed to already contain all required visible fields, validation rules, styling, layout, submit controls, and business-specific behavior. These recipes add only the FormHarbour endpoint wiring, hidden integration fields, submission identity, optional honeypot, saved-status notification, and optional confirmation-email configuration. Do not replace the existing form markup or validation unless your use case requires it.

The examples assume:

- The deployed Apps Script Web App URL ends in /exec.
- The HTML form has the ID contact-form.
- A status element has the ID form-status.
- The visible controls are kept in the order wanted in the Google Sheet.

## Master integration prompt

Use this prompt when asking an AI tool or developer to connect another website form:

~~~text
Integrate this already-built website form with the FormHarbour Google Apps Script
Web App without rebuilding its visible fields, styling, or validation. Keep the
visible field order unchanged. Add hidden _site, _submission_id, and _honeypot controls.
Set _site to the exact browser hostname without https://, a port, a path, or a
full URL. Generate one submission ID per deliberate submission and reuse that
same ID if the request is retried. Submit to the deployed /exec URL, show a
frontend saved-status message only when SHOW_CONFIRMATION_NOTIFICATION is true,
and never expose admin notification addresses in browser code.
~~~

## 1. Connect the form endpoint

Prompt:

~~~text
Integrate the FormHarbour /exec URL into the existing form's POST action. Do not
replace the existing form fields, validation, styling, or submit button. Add only
the hidden FormHarbour integration fields. Use native HTML form submission so the
form still works when cross-origin JavaScript response access is unavailable.
~~~

Code:

~~~html
<!-- Add these inside the existing form. Keep the existing fields as they are. -->
<input type="hidden" name="_site" id="form-site">
<input type="hidden" name="_submission_id" id="form-submission-id">
<input class="honeypot-field" type="text" name="_honeypot" tabindex="-1"
       autocomplete="off" aria-hidden="true">
~~~

CSS:

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

## 2. Pick the website name automatically

Prompt:

~~~text
Populate FormHarbour's _site field from window.location.hostname. Do not send
the protocol, port, page path, query string, or hash. Include a local override
for localhost testing, but leave it empty on the real website.
~~~

Code:

~~~javascript
const SITE_OVERRIDE = ""; // Use "test.example.com" only for local testing.

function getFormHarbourSite() {
  const configured = SITE_OVERRIDE.trim();
  const hostname = configured || window.location.hostname.trim().toLowerCase();
  if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") {
    throw new Error("Set SITE_OVERRIDE to a valid test hostname for local testing.");
  }
  return hostname;
}

document.getElementById("form-site").value = getFormHarbourSite();
~~~

The backend normalizes one leading www. and creates the website tab from the hostname. Never use a value such as https://example.com/contact.

## 3. Generate a duplicate-safe submission ID

Prompt:

~~~text
Generate one submission ID when the user begins a deliberate submission.
Keep it unchanged when retrying the same request, and generate a new ID only
after the submission succeeds or the user starts a new deliberate submission.
~~~

Code:

~~~javascript
function createSubmissionId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "fh-" + Date.now().toString(36) + "-" +
    Math.random().toString(36).slice(2, 10);
}

let submissionId = createSubmissionId();
document.getElementById("form-submission-id").value = submissionId;
~~~

UUID-shaped values are displayed compactly in the Sheet by the backend. Do not generate a new ID inside every retry attempt.

## 4. Add the spam honeypot

Prompt:

~~~text
Add a honeypot field named _honeypot that is unavailable to normal keyboard
and screen-reader users but is still present in the submitted form. Do not
validate it as a user field; FormHarbour rejects the submission if a bot fills it
and records the received values in a separate `honeypot - sitename` review tab.
~~~

Code:

~~~html
<input class="honeypot-field" type="text" name="_honeypot" tabindex="-1"
       autocomplete="off" aria-hidden="true">
~~~

CSS:

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

## 5. Show a frontend data-saved notification

Prompt:

~~~text
Submit this form to the FormHarbour /exec URL with fetch and URL-encoded data.
If the JSON response is accepted or duplicate and SHOW_CONFIRMATION_NOTIFICATION
is true, show a success message that the data was saved. If it is false, do not
show the browser notification. Keep the same submission ID for a retry and show
a warning when the browser cannot read the cross-origin response.
~~~

Code:

~~~javascript
const EXEC_URL = "PASTE_YOUR_EXEC_URL_HERE";
const SHOW_CONFIRMATION_NOTIFICATION = true;
const form = document.querySelector("#contact-form");
const statusBox = document.querySelector("#form-status");
let submissionId = createSubmissionId();

function showStatus(kind, message) {
  statusBox.hidden = false;
  statusBox.dataset.kind = kind;
  statusBox.textContent = message;
}

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  const payload = new URLSearchParams(new FormData(form));
  payload.set("_site", getFormHarbourSite());
  payload.set("_submission_id", submissionId);

  try {
    const response = await fetch(EXEC_URL, { method: "POST", body: payload });
    const result = await response.json();

    if (result.status === "accepted" || result.status === "duplicate") {
      if (SHOW_CONFIRMATION_NOTIFICATION) {
        showStatus(
          "success",
          result.status === "duplicate"
            ? "This submission was already saved."
            : "Your data was saved successfully."
        );
      }
      form.reset();
      submissionId = createSubmissionId();
      document.getElementById("form-submission-id").value = submissionId;
      return;
    }
    showStatus("error", result.message || "The submission was not accepted.");
  } catch (error) {
    showStatus("warning",
      "The browser could not read the response. Check the Sheet before retrying.");
    // Keep submissionId unchanged so a deliberate retry remains idempotent.
  }
});
~~~

Required status element:

~~~html
<div id="form-status" role="status" aria-live="polite" hidden></div>
~~~

The frontend notification is independent from submitter confirmation email. The shipped test-form setting is:

~~~javascript
SHOW_CONFIRMATION_NOTIFICATION: true
~~~

## 6. Enable the saved-data confirmation email

Prompt:

~~~text
Use the existing email field in this form for the submitter confirmation. It
must be named email, or CONFIRMATION_EMAIL_FIELD_NAMES must be configured to
match its existing name. Do not create a duplicate email field. Enable the
saved-data confirmation only when SEND_CONFIRMATION_EMAILS is true, and keep
admin notification addresses out of the frontend.
~~~

Existing frontend field requirement:

~~~html
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="email" required>
~~~

Backend Code.gs configuration:

~~~javascript
SEND_CONFIRMATION_EMAILS: true,
CONFIRMATION_EMAIL_FIELD_NAMES: ["email"]
~~~

The default is SEND_CONFIRMATION_EMAILS: false. When enabled, the confirmation is queued only after the Sheet row is saved and includes the website name, timestamp, submission ID, and submitted fields.

## 7. Use JSON from a same-origin or compatible client

Prompt:

~~~text
Send this form as JSON to FormHarbour. Include _site as the exact hostname,
_submission_id as the stable retry ID, and every visible form field. Handle the
JSON status value instead of relying only on the HTTP status code.
~~~

Code:

~~~javascript
fetch("PASTE_YOUR_EXEC_URL_HERE", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({
    _site: getFormHarbourSite(),
    _submission_id: submissionId,
    name: "Ada",
    email: "ada@example.com",
    phone: "",
    subject: "Test",
    message: "Hello"
  })
}).then(function (response) {
  return response.json();
}).then(function (result) {
  if (result.status === "accepted") {
    console.log("Saved", result.submissionId);
  } else {
    console.error(result.code, result.message);
  }
});
~~~

Do not place NOTIFICATION_EMAILS or other admin-only settings in frontend code.
