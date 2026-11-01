(function () {
  "use strict";

  var config = window.FORMHARBOUR_CONFIG || {};
  var form = document.getElementById("test-form");
  var submitButton = document.getElementById("submit-button");
  var statusBox = document.getElementById("form-status");
  var siteDisplay = document.getElementById("site-display");
  var siteField = document.getElementById("form-site");
  var submissionIdField = document.getElementById("form-submission-id");
  var execUrl = String(config.EXEC_URL || "").trim();
  var showConfirmationNotification = config.SHOW_CONFIRMATION_NOTIFICATION !== false;

  function resolveSite() {
    var override = String(config.SITE_OVERRIDE || "").trim();
    if (override) return override;

    var hostname = String(window.location.hostname || "").trim();
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1" && hostname.indexOf(".") >= 0) {
      return hostname;
    }
    return "test.example.com";
  }

  function newSubmissionId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return String(Date.now()) + "-" + Math.random().toString(16).slice(2);
  }

  function setStatus(kind, title, message) {
    statusBox.hidden = false;
    statusBox.className = "status status-" + kind;
    statusBox.textContent = "";

    var titleElement = document.createElement("strong");
    titleElement.textContent = title;
    var messageElement = document.createElement("span");
    messageElement.textContent = message;
    statusBox.appendChild(titleElement);
    statusBox.appendChild(messageElement);
  }

  function syncClientFields(createSubmissionId) {
    var site = resolveSite();
    siteField.value = site;
    if (createSubmissionId || !submissionIdField.value) {
      submissionIdField.value = newSubmissionId();
    }
    siteDisplay.textContent = "Submissions will use the source hostname: " + site;
  }

  function isConfigured() {
    return execUrl && execUrl.indexOf("PASTE_YOUR_DEPLOYED_EXEC_URL_HERE") === -1;
  }

  function setBusy(isBusy) {
    submitButton.disabled = isBusy;
    form.setAttribute("aria-busy", isBusy ? "true" : "false");
    submitButton.classList.toggle("is-loading", isBusy);
  }

  async function submitForm(event) {
    event.preventDefault();
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    setBusy(true);
    statusBox.hidden = true;

    var payload = new URLSearchParams();
    new FormData(form).forEach(function (value, key) {
      payload.append(key, String(value));
    });
    payload.set("_site", resolveSite());
    // Keep the same ID if the request is retried after a lock, network, or
    // response-reading failure. A new ID is created only after success.
    var submissionId = submissionIdField.value || newSubmissionId();
    submissionIdField.value = submissionId;
    payload.set("_submission_id", submissionId);

    try {
      var response = await fetch(execUrl, {
        method: "POST",
        body: payload
      });
      var responseText = await response.text();
      var result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        result = null;
      }

      if (result && (result.status === "accepted" || result.status === "duplicate")) {
        if (showConfirmationNotification) {
          var confirmationInProgress = result.confirmationStatus === "queued" || result.confirmationStatus === "processing";
          setStatus(
            "success",
            result.status === "duplicate" ? "Already accepted" : "Submission stored",
            result.status === "duplicate"
              ? "This submission was already saved."
              : (confirmationInProgress
                ? "Your data was saved. A confirmation email is being sent."
                : "Your data was saved successfully.")
          );
        } else {
          statusBox.hidden = true;
        }
        form.reset();
        syncClientFields(true);
      } else if (result) {
        setStatus("error", "Submission was not accepted", result.message || "Inspect the response code and retry.");
      } else {
        setStatus("warning", "Response was not JSON", "The endpoint responded, but the browser could not read a structured result.");
      }
    } catch (error) {
      setStatus(
        "warning",
        "Check the Sheet and email",
        "The browser could not read the cross-origin response. The request may still have reached Apps Script; verify the website tab before retrying."
      );
    } finally {
      setBusy(false);
      // Do not rotate the ID here: a retry must remain idempotent.
      syncClientFields(false);
    }
  }

  syncClientFields(true);
  if (!isConfigured()) {
    submitButton.disabled = true;
    setStatus("error", "Add the Web App URL", "Open test-form/config.js and replace EXEC_URL with your deployed /exec URL.");
    return;
  }

  form.action = execUrl;
  form.addEventListener("submit", submitForm);
}());
