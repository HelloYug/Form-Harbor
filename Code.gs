/**
 * Universal Google Apps Script form backend.
 *
 * Public configuration. Change only these values before running setup().
 */
const CONFIG = {
  // Replace this placeholder with the destination Google Spreadsheet ID.
  SPREADSHEET_ID: "YOUR_SPREADSHEET_ID",

  // Replace this example address with one or more notification recipients.
  NOTIFICATION_EMAILS: [
    "admin@gexample.com"
  ],

  // Operational alerts are separate from normal form notifications.
  ADMIN_ALERT_EMAILS: [
    "admin@gexample.com"
  ],

  // A valid value in any of these form fields receives a saved-submission
  // confirmation. Keep "email" unless the website uses another field name.
  SEND_CONFIRMATION_EMAILS: false,
  CONFIRMATION_EMAIL_FIELD_NAMES: ["email"],

  // Frontends can use the per-site response value to decide whether to show a
  // browser-level saved-data notice. This is the global fallback.
  SHOW_CONFIRMATION_NOTIFICATION: true,

  TIMEZONE: "Asia/Kolkata",

  // Daily traffic-time hours when managed system columns are auto-sized.
  HEADER_RESIZE_TRIGGER_HOURS: [9, 18],

  EMAIL_QUOTA_RESERVE_PERCENT: 10
};

// Internal defaults are deliberately kept out of CONFIG. They are safe defaults
// for ordinary contact forms and can be reviewed by an administrator if needed.
const DEFAULTS = {
  // Maximum accepted HTTP request body size in bytes.
  MAX_REQUEST_BYTES: 512 * 1024,
  // Maximum number of submitted form fields per request.
  MAX_FIELDS: 80,
  // Maximum length of one form field name in characters.
  MAX_FIELD_NAME_LENGTH: 120,
  // Maximum length of one form field value in characters.
  MAX_FIELD_VALUE_LENGTH: 10000,
  // Maximum length of a client-supplied submission ID.
  MAX_SUBMISSION_ID_LENGTH: 128,
  // Maximum length of a normalized website hostname.
  MAX_SITE_LENGTH: 253,
  // Maximum number of valid notification recipients per configuration.
  MAX_EMAIL_RECIPIENTS: 500,
  // Interval in minutes for the primary notification worker trigger.
  NOTIFICATION_TRIGGER_MINUTES: 5,
  // Lifetime of cached site-routing settings in seconds.
  SITE_CONFIG_CACHE_SECONDS: 120,
  // Delay in milliseconds before the one-time queue safety trigger runs.
  RECOVERY_TRIGGER_DELAY_MS: 6 * 60 * 1000,
  // Minimum time between repeated alerts for the same administrator issue.
  ADMIN_ALERT_COOLDOWN_MS: 15 * 60 * 1000,
  // Length of the honeypot review window in milliseconds.
  HONEYPOT_REVIEW_WINDOW_MS: 5 * 24 * 60 * 60 * 1000,
  // Rolling rate-limit window length in milliseconds.
  RATE_WINDOW_MS: 60 * 1000,
  // Maximum accepted requests per grouped website within the rate window.
  MAX_REQUESTS_PER_SITE_WINDOW: 30,
  // Maximum number of new managed sheets created in one hour.
  MAX_NEW_SHEETS_PER_HOUR: 20,
  // Maximum number of active notification queue items.
  MAX_PENDING_NOTIFICATIONS: 5000,
  // Maximum deferred website rows recovered during one worker run.
  MAX_DEFERRED_RECOVERY_ROWS: 100,
  // Maximum individual recipient attempts processed in one worker run.
  MAX_EMAILS_PER_RUN: 25,
  // Maximum worker execution budget in milliseconds.
  WORKER_TIME_BUDGET_MS: 4 * 60 * 1000,
  // Maximum queue rows inspected during one claim scan.
  MAX_QUEUE_SCAN_ROWS: 1000,
  // Maximum total queue-history rows retained in the queue sheet.
  MAX_QUEUE_ROWS: 10000,
  // Maximum delivery attempts allowed for one recipient.
  MAX_RETRIES: 5,
  // Processing-claim lease length in milliseconds.
  PROCESSING_LEASE_MS: 10 * 60 * 1000,
  // Maximum time maintenance functions wait for the shared script lock.
  ADMIN_LOCK_WAIT_MS: 30000,
  // Maximum time requests and worker operations wait for the shared lock.
  LOCK_WAIT_MS: 5000,
  // How long idempotency records remain available in milliseconds.
  IDEMPOTENCY_RETENTION_MS: 14 * 24 * 60 * 60 * 1000,
  // Maximum number of idempotency records retained in Script Properties.
  MAX_IDEMPOTENCY_RECORDS: 3000,
  // Maximum number of diagnostic log rows retained.
  LOG_RETENTION_ROWS: 1200,
  // How long completed queue rows remain before cleanup in milliseconds.
  QUEUE_RETENTION_MS: 90 * 24 * 60 * 60 * 1000,
  // How long an in-flight quota reservation remains valid in milliseconds.
  QUOTA_RESERVATION_MS: 30 * 60 * 1000,
  // Maximum rolling quota events retained for accounting.
  MAX_QUOTA_EVENTS: 200,
  // Maximum characters retained for one email field value.
  EMAIL_VALUE_LIMIT: 12000,
  // Maximum generated plain-text or HTML email body size.
  EMAIL_BODY_LIMIT: 60000,
  // Display name used for FormHarbour notification emails.
  NOTIFICATION_SENDER_NAME: "FormHarbour Notifications"
};

const SYSTEM_SHEETS = {
  QUEUE: "__FH_QUEUE",
  INDEX: "__FH_INDEX",
  LOG: "__FH_LOG"
};
const SITE_CONFIG_SHEET_NAME = "__FH_SITE_CONFIG";
const SITE_CONFIG_HEADERS = [
  "site",
  "notification_emails",
  "enabled",
  "send_confirmation_emails",
  "show_confirmation_notification",
  "submission_sheet"
];

// Website tabs intentionally follow the familiar Google Forms layout: the
// first column is the human-readable timestamp, followed by user fields. The
// reserved operational columns are appended after those fields.
const TIMESTAMP_HEADER = "Timestamp";
const HONEYPOT_SHEET_PREFIX = "honeypot - ";
const HONEYPOT_READ_STATUS_HEADER = "__fh_honeypot_read_status";
const HONEYPOT_MAILED_STATUS_HEADER = "__fh_honeypot_mailed_status";
const HONEYPOT_WINDOW_ID_HEADER = "__fh_honeypot_window_id";
const HONEYPOT_WINDOW_DEADLINE_HEADER = "__fh_honeypot_window_deadline";
const HONEYPOT_MANAGED_HEADERS = [
  HONEYPOT_READ_STATUS_HEADER,
  HONEYPOT_MAILED_STATUS_HEADER,
  HONEYPOT_WINDOW_ID_HEADER,
  HONEYPOT_WINDOW_DEADLINE_HEADER
];
const HONEYPOT_SYSTEM_HEADERS = ["_site", "_submission_id"];
const HONEYPOT_READ_UNREAD = "Unread";
const HONEYPOT_READ_READ = "Read";
const HONEYPOT_MAIL_PENDING = "Pending";
const HONEYPOT_MAIL_QUEUED = "Queued";
const HONEYPOT_MAIL_MAILED = "Mailed";
const HONEYPOT_MAIL_NOT_REQUIRED = "Not required";
const HONEYPOT_MAIL_FAILED = "Failed";
const METADATA_HEADERS = [
  "__fh_submission_id",
  TIMESTAMP_HEADER,
  "__fh_source_site",
  "__fh_notification_status"
];

const PROTECTED_METADATA_HEADERS = [
  METADATA_HEADERS[0],
  METADATA_HEADERS[2],
  METADATA_HEADERS[3]
];

const PROTECTION_DESCRIPTION_PREFIX = "FormHarbour reserved metadata: ";
const HEADER_PROTECTION_DESCRIPTION = "FormHarbour locked header row";
const SYSTEM_HEADER_PROTECTION_DESCRIPTION = "FormHarbour locked system header row";
const SYSTEM_SHEET_PROTECTION_DESCRIPTION = "FormHarbour locked system sheet";
const HEADER_STYLES = {
  config: { background: "#0f766e", font: "#ffffff" },
  site: { background: "#1f2937", font: "#ffffff" },
  honeypot: { background: "#7f1d1d", font: "#ffffff" },
  system: { background: "#374151", font: "#ffffff" }
};

const QUEUE_HEADERS = [
  "queue_id",
  "submission_key",
  "sheet_name",
  "sheet_row",
  "submission_id",
  "source_site",
  "created_at",
  "status",
  "attempts",
  "next_attempt_at",
  "lease_until",
  "last_error",
  "recipient_states_json",
  "updated_at"
];

const INDEX_HEADERS = [
  "submission_key",
  "source_site",
  "submission_id",
  "payload_digest",
  "sheet_name",
  "sheet_row",
  "created_at",
  "status"
];

const LOG_HEADERS = ["timestamp_ist", "event", "detail"];

const PROP = {
  IDEM_PREFIX: "__FH_IDEM_",
  SHEET_CREATION_EVENTS: "__FH_SHEET_CREATION_EVENTS",
  PENDING_COUNT: "__FH_PENDING_COUNT",
  QUEUE_CURSOR: "__FH_QUEUE_CURSOR",
  QUOTA_STATE: "__FH_QUOTA_STATE",
  LAST_IDEM_CLEANUP: "__FH_LAST_IDEM_CLEANUP",
  SHEET_STRUCTURE: "__FH_SHEET_STRUCTURE",
  SITE_CONFIG_CACHE_VERSION: "__FH_SITE_CONFIG_CACHE_VERSION",
  RECOVERY_TRIGGER_AT: "__FH_RECOVERY_TRIGGER_AT",
  RECOVERY_TRIGGER_ID: "__FH_RECOVERY_TRIGGER_ID",
  ALERT_PREFIX: "__FH_LAST_ALERT_"
};

// Keep implementation helpers inside a private scope. Apps Script lists every
// top-level function-valued binding in its function picker, which makes normal
// maintenance unnecessarily difficult. Only the small public API exported at
// the end of this file should appear as selectable entry points.
(function () {

// Web request parsing, validation, normalization, and public response handling.
/**
 * Receives a public Web App POST and converts internal failures into a safe
 * JSON response. Apps Script Web Apps generally cannot customize HTTP status
 * codes, so clients must inspect `status`, `code`, and `retryable`.
 *
 * @param {Object} e Apps Script Web App event object.
 * @return {TextOutput} JSON response supported by ContentService.
 */
function doPost(e) {
  var requestId = Utilities.getUuid();
  try {
    var result = handleSubmissionRequest(e, requestId);
    // Return as soon as the Sheet row and durable queue are persisted. Email
    // delivery is intentionally handled by the five-minute worker so slow
    // MailApp calls do not make the visitor wait for the form response.
    return jsonResponse(result);
  } catch (error) {
    var safeError = normalizeError(error);
    safeLog("unexpected_error", safeError.code + " request=" + requestId + " detail=" + safeErrorText(error));
    var responseStatus = safeError.code === "unexpected_error"
      ? "failed"
      : (safeError.retryable ? "retryable" : "rejected");
    return jsonResponse({
      status: responseStatus,
      code: safeError.code,
      retryable: safeError.retryable,
      requestId: requestId,
      message: safeError.publicMessage
    });
  }
}

/**
 * Validates a request, persists its row, and queues notification work while a
 * script lock protects shared spreadsheet/idempotency state. Mail is never
 * sent while this lock is held; the worker handles that separately.
 *
 * @param {Object} e Apps Script Web App event object.
 * @param {string} requestId Correlation ID used only for diagnostics.
 * @return {Object} Public response payload.
 */
var handleSubmissionRequest = function(e, requestId) {
  var parsed = parseRequest(e);
  var site = normalizeSite(parsed.fields._site);
  var recipients;
  var siteConfiguration;
  var lock = LockService.getScriptLock();

  if (!lock.tryLock(DEFAULTS.LOCK_WAIT_MS)) {
    safeLog("lock_unavailable", "request=" + requestId + " site=" + site);
    return {
      status: "retryable",
      code: "lock_unavailable",
      retryable: true,
      requestId: requestId,
      message: "The service is busy. Retry the submission."
    };
  }

  var accepted = false;
  var response;
  try {
    var spreadsheet = openConfiguredSpreadsheet();
    ensureRuntimeSystemSheets(spreadsheet);
    siteConfiguration = getSiteConfiguration(spreadsheet, site);
    recipients = siteConfiguration.recipients;
    // Rate limiting follows the grouped record sheet, so aliases share one
    // abuse budget instead of bypassing it by using different TLDs.
    var submissionSite = siteConfiguration.submissionSite || site;
    enforceRateLimit(submissionSite);

    // Honeypot submissions are deliberately recorded for review, but never
    // enter the normal website tab or idempotency store. A later worker may
    // queue one grouped review digest after the five-day review window.
    // Recording occurs after the same validation, rate limit, and lock checks
    // used by real submissions so bots cannot create unlimited tabs or rows.
    if (parsed.honeypotDetected) {
      recordHoneypotSubmission(spreadsheet, submissionSite, parsed.fields);
      SpreadsheetApp.flush();
      safeLog("honeypot_captured", "site=" + site + " request=" + requestId);
      return {
        status: "rejected",
        code: "spam_rejected",
        retryable: false,
        requestId: requestId,
        message: "The submission was rejected."
      };
    }

    var suppliedSubmissionId = firstValue(parsed.fields._submission_id).trim();
    var submissionId = normalizeSubmissionId(suppliedSubmissionId);
    // Keep the original client value in the idempotency digest so existing
    // UUID-based forms can retry safely even though the visible ID is compacted.
    var idempotencySubmissionId = suppliedSubmissionId || submissionId;
    var normalizedFields = normalizeFields(parsed.fields);
    var confirmationEmailsEnabled = siteConfiguration.sendConfirmationEmails;
    var confirmationEmail = confirmationEmailsEnabled ? findConfirmationEmail(normalizedFields) : "";
    // Hash the normalized user payload rather than raw control fields. This
    // makes harmless hostname casing/www normalization behave as one retryable
    // submission while still detecting changed user data.
    var digest = digestSubmission(site, idempotencySubmissionId, normalizedFields);
    var submissionKey = digestSubmission(site, idempotencySubmissionId, {});

    var duplicate = findIdempotencyRecord(submissionKey);
    if (duplicate) {
      if (duplicate.digest !== digest) {
        safeLog("idempotency_conflict", "site=" + site + " submission=" + submissionId);
        return {
          status: "rejected",
          code: "submission_id_reused",
          retryable: false,
          requestId: requestId,
          message: "The submission identifier was already used with different data."
        };
      }
      safeLog("duplicate_submission", "site=" + site + " submission=" + submissionId);
      return {
        status: "duplicate",
        code: "already_accepted",
        retryable: false,
        requestId: requestId,
        submissionId: duplicate.submissionId,
        sourceWebsite: duplicate.sourceSite,
        notificationStatus: duplicate.notificationStatus || "unknown",
        confirmationStatus: duplicate.confirmationStatus || "unknown",
        showConfirmationNotification: siteConfiguration.showConfirmationNotification,
        message: "This submission was already accepted."
      };
    }

    var sheet = getOrCreateSiteSheet(spreadsheet, submissionSite, site);
    var schema = ensureSiteHeaders(sheet, normalizedFields);
    if (schema.changed) protectSiteStructure(sheet, schema.headers);
    var timestamp = formatIst(new Date());
    // Queue the submitter confirmation first so the worker prioritizes it
    // before the administrator notification recipients.
    var queuedRecipients = confirmationEmail
      ? [{ email: confirmationEmail, kind: "confirmation" }]
      : [];
    queuedRecipients = queuedRecipients.concat(recipients.valid.map(function(email) {
      return { email: email, kind: "notification" };
    }));
    var initialNotificationStatus = queuedRecipients.length ? "stored" : "no_valid_recipients";
    var initialConfirmationStatus = !confirmationEmailsEnabled
      ? "disabled"
      : (confirmationEmail ? "stored" : "not_configured");
    var rowValues = buildSubmissionRow(schema, normalizedFields, {
      submissionId: submissionId,
      timestamp: timestamp,
      site: site,
      notificationStatus: initialNotificationStatus
    });
    var rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, rowValues.length).setValues([rowValues]);
    // Commit the visitor's data before creating any dependent queue work. This
    // small synchronization point protects the row-first durability contract;
    // the remaining index/queue/status writes are still completed in one fast
    // locked request and email delivery remains completely asynchronous.
    SpreadsheetApp.flush();

    var indexWarning = false;
    try {
      var indexSheet = spreadsheet.getSheetByName(SYSTEM_SHEETS.INDEX);
      indexSheet.appendRow([
        submissionKey,
        site,
        submissionId,
        digest,
        sheet.getName(),
        rowNumber,
        timestamp,
        "stored"
      ]);
    } catch (indexException) {
      indexWarning = true;
      safeLog("index_write_failure", normalizeError(indexException).code);
    }

    var notificationStatus = initialNotificationStatus;
    var queueError = null;
    if (queuedRecipients.length) {
      try {
        if (getPendingCount() >= DEFAULTS.MAX_PENDING_NOTIFICATIONS) {
          notificationStatus = "deferred_queue_full";
          initialConfirmationStatus = confirmationEmail ? "deferred_queue_full" : initialConfirmationStatus;
          queueError = "pending_notification_limit";
        } else {
          enqueueNotification(spreadsheet, {
            submissionKey: submissionKey,
            sheetName: sheet.getName(),
            sheetRow: rowNumber,
            submissionId: submissionId,
            sourceSite: site,
            recipients: queuedRecipients,
            createdAt: timestamp
          });
          notificationStatus = "queued";
          initialConfirmationStatus = confirmationEmail ? "queued" : initialConfirmationStatus;
        }
      } catch (queueException) {
        queueError = normalizeError(queueException).code;
        notificationStatus = "deferred_queue_error";
        initialConfirmationStatus = confirmationEmail ? "deferred_queue_error" : initialConfirmationStatus;
      }
    }

    var statusWarning = false;
    try {
      updateSiteNotificationStatus(sheet, rowNumber, schema, notificationStatus);
    } catch (statusException) {
      statusWarning = true;
      safeLog("status_update_failure", normalizeError(statusException).code);
    }
    var idempotencyWarning = false;
    try {
      setIdempotencyRecord(submissionKey, {
        digest: digest,
        submissionId: submissionId,
        sourceSite: site,
        sheetName: sheet.getName(),
        sheetRow: rowNumber,
        notificationStatus: notificationStatus,
        confirmationStatus: initialConfirmationStatus,
        createdAt: new Date().getTime()
      });
    } catch (idempotencyException) {
      idempotencyWarning = true;
      safeLog("idempotency_write_failure", normalizeError(idempotencyException).code);
    }
    accepted = true;
    response = {
      status: "accepted",
      code: "stored",
      retryable: false,
      requestId: requestId,
      submissionId: submissionId,
      sourceWebsite: site,
      notificationStatus: notificationStatus,
      confirmationStatus: initialConfirmationStatus,
      showConfirmationNotification: siteConfiguration.showConfirmationNotification,
      message: queueError
        ? "Submission stored. Notification delivery was deferred and will require recovery."
        : (indexWarning || statusWarning || idempotencyWarning
          ? "Submission stored with an administrative warning."
          : "Submission accepted.")
    };
    SpreadsheetApp.flush();
    if (queueError) {
      safeLog("notification_deferred", "site=" + site + " submission=" + submissionId + " reason=" + queueError);
    }
    return response;
  } catch (error) {
    var safeError = normalizeError(error);
    safeLog("storage_failure", safeError.code + " request=" + requestId + " detail=" + safeErrorText(error));
    if (accepted && response) return response;
    return {
      status: safeError.retryable ? "retryable" : "failed",
      code: safeError.code,
      retryable: safeError.retryable,
      requestId: requestId,
      message: safeError.publicMessage
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Converts JSON and URL-encoded Apps Script event variants into a bounded,
 * safe field map. Raw URL-encoded bodies are parsed first so the original
 * form control order is preserved; event parameter objects are the fallback.
 *
 * The parser intentionally does not trust browser origin information. The
 * later hostname normalizer validates the client-supplied `_site` routing hint.
 *
 * @param {Object} e Apps Script Web App event object.
 * @return {{fields: Object}} Normalized field values.
 */
var parseRequest = function(e) {
  if (!e || typeof e !== "object") {
    throw appError("empty_request", "No request event was supplied.", false);
  }

  var postData = e.postData || {};
  var body = typeof postData.contents === "string" ? postData.contents : "";
  if (body.length > DEFAULTS.MAX_REQUEST_BYTES) {
    throw appError("request_too_large", "Request exceeds the configured size limit.", false);
  }

  var contentType = String(postData.type || "").toLowerCase().split(";")[0].trim();
  var raw = Object.create(null);
  if (contentType === "application/json") {
    if (!body) throw appError("missing_body", "JSON request body is missing.", false);
    var decoded;
    try {
      decoded = JSON.parse(body);
    } catch (jsonError) {
      throw appError("malformed_json", "JSON request body is malformed.", false);
    }
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw appError("invalid_json_shape", "JSON body must be an object.", false);
    }
    Object.keys(decoded).forEach(function (key) {
      raw[key] = decoded[key];
    });
  } else {
    if (body && contentType && contentType !== "application/x-www-form-urlencoded") {
      throw appError("unsupported_content_type", "Only JSON and URL-encoded form posts are supported.", false);
    }
    var parameters = body && contentType === "application/x-www-form-urlencoded"
      ? parseUrlEncodedBody(body)
      : {};
    var parameterKeys = Object.keys(parameters);
    if (!parameterKeys.length) {
      parameters = e.parameters || {};
      parameterKeys = Object.keys(parameters);
    }
    parameterKeys.forEach(function (key) {
      raw[key] = parameters[key];
    });
    if (!parameterKeys.length && e.parameter && typeof e.parameter === "object") {
      Object.keys(e.parameter).forEach(function (key) {
        raw[key] = e.parameter[key];
      });
    }
    if (!Object.keys(raw).length) {
      throw appError("missing_fields", "No form fields were supplied.", false);
    }
  }

  var keys = Object.keys(raw);
  if (keys.length > DEFAULTS.MAX_FIELDS) {
    throw appError("too_many_fields", "Too many form fields were supplied.", false);
  }
  var fields = Object.create(null);
  keys.forEach(function (key) {
    validateFieldName(key);
    fields[key] = normalizeInputValue(raw[key], key);
  });

  var honeypotDetected = false;
  Object.keys(fields).forEach(function (key) {
    if (canonicalHeader(key) === "_honeypot" && hasNonBlank(fields[key])) {
      honeypotDetected = true;
    }
  });
  return { fields: fields, honeypotDetected: honeypotDetected };
}

/** Parses URL-encoded pairs in wire order while retaining repeated values. */
var parseUrlEncodedBody = function(body) {
  var result = Object.create(null);
  if (!body) return result;
  body.split("&").forEach(function (pair) {
    if (!pair) return;
    var separator = pair.indexOf("=");
    var encodedKey = separator < 0 ? pair : pair.substring(0, separator);
    var encodedValue = separator < 0 ? "" : pair.substring(separator + 1);
    var key;
    var value;
    try {
      key = decodeURIComponent(encodedKey.replace(/\+/g, " "));
      value = decodeURIComponent(encodedValue.replace(/\+/g, " "));
    } catch (error) {
      throw appError("malformed_form", "URL-encoded form data is malformed.", false);
    }
    if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = [];
    result[key].push(value);
  });
  return result;
}

var normalizeInputValue = function(value, key) {
  var values = Array.isArray(value) ? value : [value];
  if (values.length > DEFAULTS.MAX_FIELDS) {
    throw appError("too_many_values", "A field contains too many values.", false);
  }
  return values.map(function (item) {
    if (item === null || typeof item === "undefined") return "";
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
      var text = String(item);
      if (text.length > DEFAULTS.MAX_FIELD_VALUE_LENGTH) {
        throw appError("field_value_too_long", "A form value is too long.", false);
      }
      return text;
    }
    throw appError("invalid_field_value", "A field contains an unsupported value type.", false);
  });
}

var validateFieldName = function(name) {
  if (typeof name !== "string" || !name.trim() || name.length > DEFAULTS.MAX_FIELD_NAME_LENGTH) {
    throw appError("invalid_field_name", "A form field name is invalid.", false);
  }
  if (name === "__proto__" || name === "prototype" || name === "constructor") {
    throw appError("invalid_field_name", "A form field name is invalid.", false);
  }
}

/**
 * Removes control fields, canonicalizes user headers, and merges repeated or
 * case/whitespace-equivalent names in arrival order.
 */
var normalizeFields = function(fields) {
  var result = Object.create(null);
  Object.keys(fields).forEach(function (name) {
    var controlName = canonicalHeader(name);
    if (controlName === "_site" || controlName === "_submission_id" || controlName === "_honeypot") return;
    var canonical = canonicalHeader(name);
    if (!canonical) throw appError("invalid_field_name", "A form field name is invalid.", false);
    if (canonical === canonicalHeader(TIMESTAMP_HEADER) || canonical.indexOf("__fh_") === 0) {
      throw appError("reserved_field_name", "A reserved field name was supplied.", false);
    }
    if (!result[canonical]) {
      result[canonical] = { displayName: name.trim().replace(/\s+/g, " "), values: [] };
    }
    result[canonical].values = result[canonical].values.concat(fields[name]);
  });
  return result;
}

/** Finds the first valid submitter address from the configured form fields. */
var findConfirmationEmail = function(fields) {
  var configured = CONFIG.CONFIRMATION_EMAIL_FIELD_NAMES;
  var names = Array.isArray(configured) ? configured : [configured];
  for (var i = 0; i < names.length; i++) {
    var field = fields[canonicalHeader(names[i])];
    if (!field || !field.values || !field.values.length) continue;
    var address = normalizeRecipients([firstValue(field.values)]).valid;
    if (address.length) return address[0];
  }
  return "";
}

/**
 * Accepts a hostname routing hint, removes one leading `www.`, keeps valid
 * subdomains distinct, and rejects URLs, paths, ports, and unsafe labels.
 */
var normalizeSite = function(value) {
  var candidate = firstValue(value).trim().toLowerCase();
  if (candidate.indexOf("www.") === 0) candidate = candidate.substring(4);
  if (candidate.charAt(candidate.length - 1) === ".") candidate = candidate.substring(0, candidate.length - 1);
  if (!candidate || candidate.length > DEFAULTS.MAX_SITE_LENGTH || candidate.indexOf("/") >= 0 || candidate.indexOf(":") >= 0) {
    throw appError("invalid_site", "A valid website hostname is required in _site.", false);
  }
  var labels = candidate.split(".");
  if (labels.length < 2 || labels.some(function (label) {
    return !label || label.length > 63 || !/^[a-z0-9\u0080-\uffff](?:[a-z0-9\u0080-\uffff-]*[a-z0-9\u0080-\uffff])?$/i.test(label);
  })) {
    throw appError("invalid_site", "A valid website hostname is required in _site.", false);
  }
  return candidate;
}

/** Uses a client ID when supplied and compacts UUID-shaped IDs for display. */
var normalizeSubmissionId = function(value) {
  var id = firstValue(value).trim();
  if (!id) id = Utilities.getUuid();
  if (id.length > DEFAULTS.MAX_SUBMISSION_ID_LENGTH || /[\r\n]/.test(id)) {
    throw appError("invalid_submission_id", "The submission identifier is invalid.", false);
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    id = "fh-" + sha256(id.toLowerCase()).substring(0, 16);
  }
  return id;
}

var firstValue = function(value) {
  if (Array.isArray(value)) return value.length ? String(value[0]) : "";
  return value === null || typeof value === "undefined" ? "" : String(value);
}

var hasNonBlank = function(value) {
  return firstValue(value).trim() !== "";
}

var canonicalHeader = function(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

var digestSubmission = function(site, submissionId, fields) {
  var keys = Object.keys(fields).sort();
  var canonical = site + "\n" + submissionId + "\n" + keys.map(function (key) {
    return key + "=" + JSON.stringify(fields[key]);
  }).join("\n");
  return sha256(canonical);
}

// Spreadsheet and dynamic-schema helpers. Website tabs contain only metadata
// plus submitted fields; queue and diagnostics live in hidden system tabs, and
// site-specific notification routing lives in the visible __FH_SITE_CONFIG tab.
/** Computes a stable hex SHA-256 digest for idempotency and safe property keys. */
var sha256 = function(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function (byte) {
    var unsigned = byte < 0 ? byte + 256 : byte;
    return (unsigned < 16 ? "0" : "") + unsigned.toString(16);
  }).join("");
}

var openConfiguredSpreadsheet = function() {
  if (!CONFIG.SPREADSHEET_ID || CONFIG.SPREADSHEET_ID === "YOUR_SPREADSHEET_ID") {
    throw appError("configuration_missing", "Spreadsheet ID is not configured.", false);
  }
  try {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  } catch (error) {
    throw appError("spreadsheet_unavailable", "The configured spreadsheet is unavailable.", true);
  }
}

var ensureSystemSheets = function(spreadsheet) {
  ensureSystemSheet(spreadsheet, SYSTEM_SHEETS.QUEUE, QUEUE_HEADERS);
  ensureSystemSheet(spreadsheet, SYSTEM_SHEETS.INDEX, INDEX_HEADERS);
  ensureSystemSheet(spreadsheet, SYSTEM_SHEETS.LOG, LOG_HEADERS);
  ensureSiteConfigSheet(spreadsheet);
  ensureSiteConfigFirst(spreadsheet);
}

/**
 * Keeps the submission and worker lock sections short after setup has already
 * initialized the managed tabs. Full protection and structure repair belongs
 * to setup() and the spreadsheet-change trigger, not every public request.
 * The fallback preserves first-request behavior for a brand-new test/workbook.
 */
var ensureRuntimeSystemSheets = function(spreadsheet) {
  restoreRememberedSheetNames(spreadsheet);
  var required = [
    SYSTEM_SHEETS.QUEUE,
    SYSTEM_SHEETS.INDEX,
    SYSTEM_SHEETS.LOG,
    SITE_CONFIG_SHEET_NAME
  ];
  var initialized = required.every(function(name) {
    return Boolean(spreadsheet.getSheetByName(name));
  });
  if (!initialized) ensureSystemSheets(spreadsheet);
}

/**
 * Restores only managed tab names during normal traffic. Full header,
 * protection, and ordering reconciliation remains reserved for setup() and
 * the spreadsheet-change trigger so public submissions stay fast. Stable
 * Sheet IDs prevent a delayed change trigger from causing a duplicate queue
 * or website tab after an authorized editor renames one.
 */
var restoreRememberedSheetNames = function(spreadsheet) {
  var properties = PropertiesService.getScriptProperties();
  var structures;
  try { structures = JSON.parse(properties.getProperty(PROP.SHEET_STRUCTURE) || "{}"); } catch (error) { structures = {}; }
  if (!structures || typeof structures !== "object") return;

  var sheetsById = {};
  spreadsheet.getSheets().forEach(function(sheet) {
    sheetsById[sheetStructureId(sheet)] = sheet;
  });
  Object.keys(structures).forEach(function(id) {
    var expected = structures[id];
    var sheet = sheetsById[id];
    if (!sheet || !expected || !expected.name) return;
    if (sheet.getName() === expected.name || spreadsheet.getSheetByName(expected.name)) return;
    try {
      sheet.setName(expected.name);
    } catch (error) {
      safeLog("managed_sheet_name_restore_failure", String(expected.name));
    }
  });
}

var ensureSystemSheet = function(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!sheet.isSheetHidden()) sheet.hideSheet();
  protectHeaderRow(sheet, headers, SYSTEM_HEADER_PROTECTION_DESCRIPTION);
  protectSystemSheet(sheet);
  rememberSheetStructure(sheet, headers, "system");
  return sheet;
}

/** Backfills the grouping column without overwriting manual aliases. */
var ensureSiteConfigSubmissionSheetValues = function(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, SITE_CONFIG_HEADERS.length).getValues();
  rows.forEach(function(row, index) {
    if (String(row[5] || "").trim()) return;
    var rawSite = String(row[0] || "").trim();
    if (!rawSite) return;
    var parsedSite = parseSubmissionSheet(rawSite, "");
    if (!parsedSite.valid) return;
    // Update only the new column; preserve any existing formulas or manual
    // values in the notification and feature-control columns.
    sheet.getRange(index + 2, 6).setValue(parsedSite.value);
  });
}

var ensureSiteConfigSheet = function(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(SITE_CONFIG_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(SITE_CONFIG_SHEET_NAME);
  var currentHeaders = sheet.getLastColumn()
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    : [];
  var headersMatch = currentHeaders.length === SITE_CONFIG_HEADERS.length && SITE_CONFIG_HEADERS.every(function(header, index) {
    return canonicalHeader(currentHeaders[index]) === canonicalHeader(header);
  });
  if (!headersMatch) sheet.getRange(1, 1, 1, SITE_CONFIG_HEADERS.length).setValues([SITE_CONFIG_HEADERS]);
  ensureSiteConfigSubmissionSheetValues(sheet);
  protectHeaderRow(sheet, SITE_CONFIG_HEADERS);
  rememberSheetStructure(sheet, SITE_CONFIG_HEADERS, "config");
  return sheet;
}

/** Applies strict TRUE/FALSE dropdown validation to site-level switches. */
var applySiteConfigBooleanValidation = function(sheet, startRow, rowCount) {
  if (!SpreadsheetApp.newDataValidation) return;
  var booleanRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["TRUE", "FALSE"], true)
    .setAllowInvalid(false)
    .build();
  [3, 4, 5].forEach(function(column) {
    sheet.getRange(startRow, column, Math.max(1, rowCount), 1).setDataValidation(booleanRule);
  });
}

var ensureSiteConfigFirst = function(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(SITE_CONFIG_SHEET_NAME);
  if (!sheet) return;
  try {
    if (typeof spreadsheet.setActiveSheet === "function" && typeof spreadsheet.moveActiveSheet === "function") {
      spreadsheet.setActiveSheet(sheet);
      spreadsheet.moveActiveSheet(1);
    }
  } catch (error) {
    safeLog("site_config_order_failure", normalizeError(error).code);
  }
}

/** Creates a managed tab under the caller's script lock. */
var getOrCreateManagedSheet = function(spreadsheet, name) {
  var existing = spreadsheet.getSheetByName(name);
  if (existing) return existing;

  var now = new Date().getTime();
  var events = readNumberArrayProperty(PROP.SHEET_CREATION_EVENTS).filter(function (time) {
    return now - time < 60 * 60 * 1000;
  });
  if (events.length >= DEFAULTS.MAX_NEW_SHEETS_PER_HOUR) {
    throw appError("site_capacity", "The website sheet creation limit was reached. Retry later.", true);
  }
  var sheet;
  try {
    sheet = spreadsheet.insertSheet(name);
  } catch (error) {
    var retry = spreadsheet.getSheetByName(name);
    if (retry) return retry;
    throw appError("sheet_creation_failed", "A website sheet could not be created.", true);
  }
  events.push(now);
  PropertiesService.getScriptProperties().setProperty(PROP.SHEET_CREATION_EVENTS, JSON.stringify(events));
  return sheet;
}

/**
 * Resolves the deterministic grouped record tab name. The source site is
 * still registered independently so every incoming hostname remains visible
 * in __fh_source_site and configurable in __FH_SITE_CONFIG.
 */
var getOrCreateSiteSheet = function(spreadsheet, submissionSite, sourceSite) {
  var sheet = getOrCreateManagedSheet(spreadsheet, siteTabName(submissionSite));
  ensureSiteConfigRow(spreadsheet, sourceSite || submissionSite);
  // Start with the Google Forms-compatible first column. ensureSiteHeaders()
  // will append user fields and the reserved operational columns in one
  // ordered schema pass before the first row is written.
  var firstHeader = sheet.getLastColumn() ? String(sheet.getRange(1, 1).getValues()[0][0] || "") : "";
  if (firstHeader !== TIMESTAMP_HEADER) sheet.getRange(1, 1, 1, 1).setValues([[TIMESTAMP_HEADER]]);
  return sheet;
}

var siteTabName = function(site) {
  if (site.length <= 100) return site;
  return site.substring(0, 80) + "-" + sha256(site).substring(0, 19);
}

/** Keeps honeypot captures separate from real submissions and site tabs. */
var honeypotTabName = function(site) {
  var fullName = HONEYPOT_SHEET_PREFIX + site;
  if (fullName.length <= 100) return fullName;
  var hash = sha256(site).substring(0, 16);
  var available = 100 - HONEYPOT_SHEET_PREFIX.length - hash.length - 1;
  return HONEYPOT_SHEET_PREFIX + site.substring(0, Math.max(1, available)) + "-" + hash;
}

/**
 * Stores a honeypot hit without normalizing it into a real submission. The
 * capture sheet keeps Timestamp first, then the received fields in arrival
 * order, and never creates a notification queue item.
 */
var recordHoneypotSubmission = function(spreadsheet, site, fields) {
  var sheet = getOrCreateManagedSheet(spreadsheet, honeypotTabName(site));
  var entries = [];
  var entryPositions = Object.create(null);

  Object.keys(fields).forEach(function(name) {
    var displayName = name.trim().replace(/\s+/g, " ");
    var canonical = canonicalHeader(displayName);
    // Keep the capture schema valid if a bot also submits a reserved header.
    if (canonical === canonicalHeader(TIMESTAMP_HEADER) || canonical.indexOf("__fh_") === 0) {
      displayName = "_raw_" + displayName;
      canonical = canonicalHeader(displayName);
    }
    var existingIndex = entryPositions[canonical];
    if (existingIndex === undefined) {
      entryPositions[canonical] = entries.length;
      entries.push({ displayName: displayName, values: [] });
      existingIndex = entries.length - 1;
    }
    // Keep honeypot IDs consistent with normal submissions. Honeypot records
    // are not idempotency-processed, but their visible ID should still use the
    // compact fh- format when the client supplied a UUID.
    var captureValues = fields[name];
    if (canonical === canonicalHeader("_submission_id")) {
      captureValues = [normalizeSubmissionId(fields[name])];
    }
    entries[existingIndex].values = entries[existingIndex].values.concat(captureValues);
  });

  var schema = ensureHoneypotHeaders(sheet, entries);
  if (schema.changed) protectHoneypotStructure(sheet, schema.headers);
  normalizeLegacyHoneypotRows(sheet, schema);
  var now = new Date().getTime();
  var reviewWindow = findActiveHoneypotWindow(sheet, schema, now);
  if (!reviewWindow) {
    reviewWindow = {
      id: "hp-" + Utilities.getUuid().replace(/[^a-zA-Z0-9]/g, "").substring(0, 20),
      deadlineAt: now + Number(DEFAULTS.HONEYPOT_REVIEW_WINDOW_MS)
    };
  }
  var row = new Array(schema.headers.length).fill("");
  row[schema.positions[canonicalHeader(TIMESTAMP_HEADER)]] = formatIst(new Date());
  row[schema.positions[canonicalHeader(HONEYPOT_READ_STATUS_HEADER)]] = HONEYPOT_READ_UNREAD;
  row[schema.positions[canonicalHeader(HONEYPOT_MAILED_STATUS_HEADER)]] = HONEYPOT_MAIL_PENDING;
  row[schema.positions[canonicalHeader(HONEYPOT_WINDOW_ID_HEADER)]] = reviewWindow.id;
  row[schema.positions[canonicalHeader(HONEYPOT_WINDOW_DEADLINE_HEADER)]] = new Date(reviewWindow.deadlineAt).toISOString();
  entries.forEach(function(entry) {
    var index = schema.positions[canonicalHeader(entry.displayName)];
    if (index !== undefined) row[index] = cellValue(entry.values);
  });
  var rowNumber = sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  // Add the Read/Unread dropdown only to the row just created. Do not apply
  // validation to unused rows all the way down the Sheet.
  applyHoneypotReadValidation(sheet, schema.headers, rowNumber, 1);
}

/** Evolves a honeypot capture tab while preserving its received field order. */
var ensureHoneypotHeaders = function(sheet, entries) {
  var lastColumn = sheet.getLastColumn();
  var currentHeaders = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  var userHeaders = [];
  var seen = Object.create(null);
  currentHeaders.forEach(function(header) {
    var text = String(header || "").trim();
    var canonical = canonicalHeader(text);
    var isManaged = HONEYPOT_MANAGED_HEADERS.some(function(managedHeader) {
      return canonical === canonicalHeader(managedHeader);
    });
    if (!text || canonical === canonicalHeader(TIMESTAMP_HEADER) || isManaged || seen[canonical]) return;
    seen[canonical] = true;
    userHeaders.push(text);
  });
  entries.forEach(function(entry) {
    var canonical = canonicalHeader(entry.displayName);
    var isManaged = HONEYPOT_MANAGED_HEADERS.some(function(managedHeader) {
      return canonical === canonicalHeader(managedHeader);
    });
    if (!isManaged && !seen[canonical]) {
      seen[canonical] = true;
      userHeaders.push(entry.displayName);
    }
  });

  var desiredHeaders = [TIMESTAMP_HEADER].concat(userHeaders, HONEYPOT_MANAGED_HEADERS);
  var currentKeys = currentHeaders.map(canonicalHeader);
  var desiredKeys = desiredHeaders.map(canonicalHeader);
  var needsRewrite = currentKeys.length !== desiredKeys.length || currentKeys.some(function(key, index) {
    return key !== desiredKeys[index] || String(currentHeaders[index] || "") !== desiredHeaders[index];
  });
  if (needsRewrite) {
    var rowCount = Math.max(sheet.getLastRow(), 1);
    var oldColumnCount = Math.max(currentHeaders.length, desiredHeaders.length, 1);
    var oldPositions = Object.create(null);
    currentHeaders.forEach(function(header, index) {
      var canonical = canonicalHeader(header);
      if (canonical && oldPositions[canonical] === undefined) oldPositions[canonical] = index;
    });
    var oldValues = sheet.getRange(1, 1, rowCount, currentHeaders.length || 1).getValues();
    var newValues = [];
    for (var rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      newValues.push(desiredHeaders.map(function(header) {
        if (rowIndex === 0) return header;
        var oldIndex = oldPositions[canonicalHeader(header)];
        return oldIndex === undefined ? "" : oldValues[rowIndex][oldIndex];
      }));
    }
    sheet.getRange(1, 1, rowCount, oldColumnCount).clearContent();
    sheet.getRange(1, 1, rowCount, desiredHeaders.length).setValues(newValues);
  }
  var positions = Object.create(null);
  desiredHeaders.forEach(function(header, index) { positions[canonicalHeader(header)] = index; });
  return { headers: desiredHeaders, positions: positions, changed: needsRewrite };
}

var normalizeLegacyHoneypotRows = function(sheet, schema) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var values = sheet.getRange(2, 1, lastRow - 1, schema.headers.length).getValues();
  var readIndex = schema.positions[canonicalHeader(HONEYPOT_READ_STATUS_HEADER)];
  var mailedIndex = schema.positions[canonicalHeader(HONEYPOT_MAILED_STATUS_HEADER)];
  var changed = false;
  values.forEach(function(row) {
    if (!String(row[schema.positions[canonicalHeader(TIMESTAMP_HEADER)]] || "").trim()) return;
    if (!String(row[readIndex] || "").trim()) {
      row[readIndex] = HONEYPOT_READ_READ;
      changed = true;
    }
    if (!String(row[mailedIndex] || "").trim()) {
      row[mailedIndex] = HONEYPOT_MAIL_NOT_REQUIRED;
      changed = true;
    }
  });
  if (changed) sheet.getRange(2, 1, values.length, schema.headers.length).setValues(values);
}

var parseHoneypotDeadline = function(value) {
  if (value instanceof Date && isFinite(value.getTime())) return value.getTime();
  var text = String(value || "").trim();
  if (!text) return 0;
  var parsed = new Date(text).getTime();
  return isFinite(parsed) ? parsed : 0;
}

var findActiveHoneypotWindow = function(sheet, schema, now) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, 1, lastRow - 1, schema.headers.length).getValues();
  var windowIndex = schema.positions[canonicalHeader(HONEYPOT_WINDOW_ID_HEADER)];
  var deadlineIndex = schema.positions[canonicalHeader(HONEYPOT_WINDOW_DEADLINE_HEADER)];
  var active = null;
  values.forEach(function(row) {
    var id = String(row[windowIndex] || "").trim();
    var deadlineAt = parseHoneypotDeadline(row[deadlineIndex]);
    if (!id || deadlineAt <= now) return;
    if (!active || deadlineAt > active.deadlineAt) active = { id: id, deadlineAt: deadlineAt };
  });
  return active;
}

var clearHoneypotReadValidation = function(sheet, headers) {
  var columnIndex = -1;
  headers.forEach(function(header, index) {
    if (canonicalHeader(header) === canonicalHeader(HONEYPOT_READ_STATUS_HEADER)) columnIndex = index;
  });
  if (columnIndex < 0 || !sheet.getRange(2, columnIndex + 1, 1, 1).clearDataValidations) return;
  sheet.getRange(2, columnIndex + 1, Math.max(1, sheet.getMaxRows() - 1), 1).clearDataValidations();
}

var applyHoneypotReadValidation = function(sheet, headers, startRow, rowCount) {
  var columnIndex = -1;
  headers.forEach(function(header, index) {
    if (canonicalHeader(header) === canonicalHeader(HONEYPOT_READ_STATUS_HEADER)) columnIndex = index;
  });
  if (columnIndex < 0 || !SpreadsheetApp.newDataValidation) return;
  if (typeof startRow === "undefined") {
    startRow = 2;
    rowCount = Math.max(0, sheet.getLastRow() - 1);
  }
  if (!rowCount || rowCount < 1) return;
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList([HONEYPOT_READ_UNREAD, HONEYPOT_READ_READ], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(startRow, columnIndex + 1, rowCount, 1).setDataValidation(rule);
}

var readHoneypotRecords = function(sheet) {
  if (!sheet || sheet.getLastRow() < 2 || !sheet.getLastColumn()) return [];
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();
  var positions = Object.create(null);
  headers.forEach(function(header, index) { positions[canonicalHeader(header)] = index; });
  var timestampIndex = positions[canonicalHeader(TIMESTAMP_HEADER)];
  var readIndex = positions[canonicalHeader(HONEYPOT_READ_STATUS_HEADER)];
  var mailedIndex = positions[canonicalHeader(HONEYPOT_MAILED_STATUS_HEADER)];
  var windowIndex = positions[canonicalHeader(HONEYPOT_WINDOW_ID_HEADER)];
  var deadlineIndex = positions[canonicalHeader(HONEYPOT_WINDOW_DEADLINE_HEADER)];
  return values.map(function(row, offset) {
    var fields = [];
    headers.forEach(function(header, index) {
      var canonical = canonicalHeader(header);
      if (!header || canonical === canonicalHeader(TIMESTAMP_HEADER) || HONEYPOT_MANAGED_HEADERS.some(function(managed) {
        return canonical === canonicalHeader(managed);
      })) return;
      fields.push({ label: String(header), value: String(row[index] || "") });
    });
    return {
      rowNumber: offset + 2,
      timestamp: String(row[timestampIndex] || ""),
      readStatus: String(row[readIndex] || "").trim() || HONEYPOT_READ_READ,
      mailedStatus: String(row[mailedIndex] || "").trim() || HONEYPOT_MAIL_NOT_REQUIRED,
      windowId: String(row[windowIndex] || "").trim(),
      deadlineAt: parseHoneypotDeadline(row[deadlineIndex]),
      fields: fields
    };
  }).filter(function(record) { return record.timestamp; });
}

/**
 * Evolves one website tab while preserving user-field order and row values.
 * The schema is kept in Google Forms order: Timestamp, user fields, then
 * reserved operational columns. Duplicate canonical headers are rejected
 * because silently choosing one could misalign old data.
 */
var ensureSiteHeaders = function(sheet, fields) {
  var lastColumn = sheet.getLastColumn();
  var headers = lastColumn ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  var positions = Object.create(null);
  headers.forEach(function (header, index) {
    var canonical = schemaHeaderKey(header);
    if (!canonical) return;
    if (positions[canonical] !== undefined) {
      throw appError("header_collision", "The website sheet contains ambiguous duplicate headers.", false);
    }
    positions[canonical] = index;
  });

  // Preserve the existing order of user fields, but always rebuild the sheet
  // into: Timestamp -> user fields -> reserved operational metadata. This also
  // migrates the earlier `__fh_timestamp_ist` layout by header name.
  var userHeaders = [];
  headers.forEach(function (header) {
    if (header && !isReservedMetadataHeader(header)) userHeaders.push(String(header).trim().replace(/\s+/g, " "));
  });
  Object.keys(fields).forEach(function (canonical) {
    if (positions[canonical] === undefined) userHeaders.push(fields[canonical].displayName);
  });

  var desiredHeaders = [TIMESTAMP_HEADER].concat(userHeaders, [
    METADATA_HEADERS[0],
    METADATA_HEADERS[2],
    METADATA_HEADERS[3]
  ]);
  var currentKeys = headers.map(schemaHeaderKey);
  var desiredKeys = desiredHeaders.map(schemaHeaderKey);
  var needsRewrite = currentKeys.length !== desiredKeys.length || currentKeys.some(function (key, index) {
    return key !== desiredKeys[index] || String(headers[index] || "") !== desiredHeaders[index];
  });

  if (needsRewrite) {
    var rowCount = Math.max(sheet.getLastRow(), 1);
    var oldColumnCount = Math.max(headers.length, desiredHeaders.length);
    if (sheet.getMaxColumns() < desiredHeaders.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), desiredHeaders.length - sheet.getMaxColumns());
    }
    var oldValues = sheet.getRange(1, 1, rowCount, headers.length || 1).getValues();
    var newValues = [];
    for (var rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      newValues.push(desiredHeaders.map(function (header) {
        if (rowIndex === 0) return header;
        var oldIndex = positions[schemaHeaderKey(header)];
        return oldIndex === undefined ? "" : oldValues[rowIndex][oldIndex];
      }));
    }
    sheet.getRange(1, 1, rowCount, oldColumnCount).clearContent();
    sheet.getRange(1, 1, rowCount, desiredHeaders.length).setValues(newValues);
    headers = desiredHeaders;
  } else {
    headers = desiredHeaders;
  }

  positions = Object.create(null);
  headers.forEach(function (header, index) {
    var canonical = schemaHeaderKey(header);
    if (canonical) positions[canonical] = index;
  });
  return { headers: headers, positions: positions, changed: needsRewrite };
}

/** Treats the old timestamp name as an alias during one-time migration. */
var schemaHeaderKey = function(header) {
  var canonical = canonicalHeader(header);
  return canonical === "__fh_timestamp_ist" ? canonicalHeader(TIMESTAMP_HEADER) : canonical;
}

/** Identifies metadata that must never be accepted as user form fields. */
var isReservedMetadataHeader = function(header) {
  var canonical = schemaHeaderKey(header);
  return canonical === canonicalHeader(TIMESTAMP_HEADER) || canonical.indexOf("__fh_") === 0;
}

var buildSubmissionRow = function(schema, fields, metadata) {
  var row = new Array(schema.headers.length).fill("");
  Object.keys(fields).forEach(function (canonical) {
    var index = schema.positions[canonical];
    if (index !== undefined) row[index] = cellValue(fields[canonical].values);
  });
  row[schema.positions[canonicalHeader(METADATA_HEADERS[0])]] = cellValue(metadata.submissionId);
  row[schema.positions[canonicalHeader(METADATA_HEADERS[1])]] = cellValue(metadata.timestamp);
  row[schema.positions[canonicalHeader(METADATA_HEADERS[2])]] = cellValue(metadata.site);
  row[schema.positions[canonicalHeader(METADATA_HEADERS[3])]] = cellValue(metadata.notificationStatus);
  return row;
}

var cellValue = function(value) {
  // A leading formula character would be interpreted by Sheets. Prefixing
  // only formula-shaped values preserves ordinary text while blocking formula
  // injection from public form fields.
  var text = Array.isArray(value) ? value.map(String).join("\n") : String(value === null || typeof value === "undefined" ? "" : value);
  if (/^[\s]*[=+\-@]/.test(text)) return "'" + text;
  return text;
}

var updateSiteNotificationStatus = function(sheet, rowNumber, schema, status) {
  var index = schema.positions[canonicalHeader(METADATA_HEADERS[3])];
  if (index !== undefined) sheet.getRange(rowNumber, index + 1).setValue(cellValue(status));
}

// Recipient normalization and durable queue creation. Recipient addresses are
// stored only in hidden queue state and are never returned by doPost.
/**
 * Normalizes a string or array recipient setting, removes case-insensitive
 * duplicates, and excludes invalid entries without discarding valid ones.
 * Individual sends are used later so recipients do not see one another.
 */
var normalizeRecipients = function(configured) {
  var rawSource = Array.isArray(configured) ? configured : [configured];
  var source = [];
  rawSource.forEach(function(entry) {
    if (typeof entry === "string") {
      entry.split(/[,;\n]+/).forEach(function(part) { source.push(part); });
    } else {
      source.push(entry);
    }
  });
  var valid = [];
  var invalid = [];
  var seen = Object.create(null);
  source.forEach(function (entry) {
    if (entry === null || typeof entry === "undefined" || String(entry).trim() === "") return;
    if (typeof entry !== "string") {
      invalid.push(String(entry));
      return;
    }
    var email = entry.trim();
    var key = email.toLowerCase();
    if (!/^[^\s@<>(),;:]+@[^\s@<>(),;:]+\.[^\s@<>(),;:]{2,}$/.test(email)) {
      invalid.push(email);
      return;
    }
    if (!seen[key]) {
      seen[key] = true;
      valid.push(email);
    }
  });
  if (valid.length > DEFAULTS.MAX_EMAIL_RECIPIENTS) {
    invalid = invalid.concat(valid.slice(DEFAULTS.MAX_EMAIL_RECIPIENTS));
    valid = valid.slice(0, DEFAULTS.MAX_EMAIL_RECIPIENTS);
  }
  return { valid: valid, invalid: invalid };
}

var parseSiteConfigBoolean = function(value, fallback) {
  var normalized = String(value === null || typeof value === "undefined" ? "" : value).trim().toLowerCase();
  if (!normalized) return { value: Boolean(fallback), valid: true };
  if (["true", "1", "yes", "enabled", "on"].indexOf(normalized) >= 0) {
    return { value: true, valid: true };
  }
  if (["false", "0", "no", "disabled", "off"].indexOf(normalized) >= 0) {
    return { value: false, valid: true };
  }
  return { value: Boolean(fallback), valid: false };
}

/**
 * Resolves the optional grouped storage hostname. Keeping this hostname-like
 * prevents unsafe or ambiguous Google Sheet tab names while allowing aliases
 * such as brand.com and brand.in to share one record and honeypot sheet.
 */
var parseSubmissionSheet = function(value, fallbackSite) {
  var raw = String(value === null || typeof value === "undefined" ? "" : value).trim();
  if (!raw) return { value: fallbackSite, valid: true };
  try {
    return { value: normalizeSite(raw), valid: true };
  } catch (error) {
    return { value: fallbackSite, valid: false };
  }
}

var siteConfigEnabled = function(value) {
  return parseSiteConfigBoolean(value, true).value;
}

/** Returns all site-level controls, falling back to the global configuration. */
var siteConfigurationCacheKey = function(site) {
  var version = PropertiesService.getScriptProperties().getProperty(PROP.SITE_CONFIG_CACHE_VERSION) || "1";
  return "fh_site_cfg_" + version + "_" + sha256(site).substring(0, 32);
}

var getSiteConfiguration = function(spreadsheet, site) {
  var cacheKey = siteConfigurationCacheKey(site);
  try {
    var cached = CacheService.getScriptCache().get(cacheKey);
    if (cached) {
      var cachedConfiguration = JSON.parse(cached);
      // A cache entry from before grouped sheets existed can remain alive
      // briefly after an update. Preserve safe single-site behavior.
      if (!cachedConfiguration.submissionSite) cachedConfiguration.submissionSite = site;
      return cachedConfiguration;
    }
  } catch (cacheError) {
    // CacheService is an optimization only; continue with the Sheet source.
  }

  var fallback = normalizeRecipients(CONFIG.NOTIFICATION_EMAILS);
  fallback.source = "global_fallback";
  fallback.configured = false;
  var configuration = {
    recipients: fallback,
    sendConfirmationEmails: CONFIG.SEND_CONFIRMATION_EMAILS === true,
    showConfirmationNotification: CONFIG.SHOW_CONFIRMATION_NOTIFICATION !== false,
    submissionSite: site,
    configured: false
  };
  var sheet = spreadsheet.getSheetByName(SITE_CONFIG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) {
    cacheSiteConfiguration(cacheKey, configuration);
    return configuration;
  }
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, SITE_CONFIG_HEADERS.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    var configuredSite = String(rows[i][0] || "").trim();
    if (!configuredSite) continue;
    var normalizedSite;
    try {
      normalizedSite = normalizeSite(configuredSite);
    } catch (error) {
      continue;
    }
    if (normalizedSite !== site) continue;
    var enabled = parseSiteConfigBoolean(rows[i][2], true);
    var confirmationEmails = parseSiteConfigBoolean(rows[i][3], configuration.sendConfirmationEmails);
    var frontendNotification = parseSiteConfigBoolean(rows[i][4], configuration.showConfirmationNotification);
    var submissionSheet = parseSubmissionSheet(rows[i][5], site);
    configuration.sendConfirmationEmails = confirmationEmails.value;
    configuration.showConfirmationNotification = frontendNotification.value;
    configuration.submissionSite = submissionSheet.value;
    configuration.configured = true;
    if (!enabled.value) {
      configuration.recipients = { valid: [], invalid: [], source: "site_disabled", configured: true };
      cacheSiteConfiguration(cacheKey, configuration);
      return configuration;
    }
    var selected = normalizeRecipients(rows[i][1]);
    selected.source = "site_config";
    selected.configured = true;
    configuration.recipients = selected;
    cacheSiteConfiguration(cacheKey, configuration);
    return configuration;
  }
  cacheSiteConfiguration(cacheKey, configuration);
  return configuration;
}

var cacheSiteConfiguration = function(cacheKey, configuration) {
  try {
    CacheService.getScriptCache().put(
      cacheKey,
      JSON.stringify(configuration),
      DEFAULTS.SITE_CONFIG_CACHE_SECONDS
    );
  } catch (cacheError) {
    // A cache miss never prevents a valid form submission.
  }
}

var invalidateSiteConfigurationCache = function(site) {
  try {
    CacheService.getScriptCache().remove(siteConfigurationCacheKey(site));
  } catch (cacheError) {
    // Cache invalidation is best effort; the two-minute TTL remains the guard.
  }
}

/** Invalidates all cached site settings after a manual config-sheet edit. */
var invalidateAllSiteConfigurationCache = function() {
  try {
    var properties = PropertiesService.getScriptProperties();
    var current = Number(properties.getProperty(PROP.SITE_CONFIG_CACHE_VERSION) || 1);
    properties.setProperty(PROP.SITE_CONFIG_CACHE_VERSION, String(current + 1));
  } catch (cacheError) {
    // The two-minute TTL remains the fallback if property invalidation fails.
  }
}

/** Returns site-specific recipients, falling back to the global configuration. */
var getSiteNotificationRecipients = function(spreadsheet, site) {
  return getSiteConfiguration(spreadsheet, site).recipients;
}

var ensureSiteConfigRow = function(spreadsheet, site) {
  var sheet = ensureSiteConfigSheet(spreadsheet);
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var rows = sheet.getRange(2, 1, lastRow - 1, SITE_CONFIG_HEADERS.length).getValues();
    var exists = rows.some(function(row) {
      try { return normalizeSite(row[0]) === site; } catch (error) { return false; }
    });
    if (exists) return;
  }
  var fallback = normalizeRecipients(CONFIG.NOTIFICATION_EMAILS).valid.join(", ");
  sheet.appendRow([
    site,
    fallback,
    "TRUE",
    CONFIG.SEND_CONFIRMATION_EMAILS === true ? "TRUE" : "FALSE",
    CONFIG.SHOW_CONFIRMATION_NOTIFICATION === false ? "FALSE" : "TRUE",
    site
  ]);
  applySiteConfigBooleanValidation(sheet, sheet.getLastRow(), 1);
  invalidateSiteConfigurationCache(site);
}

var siteNameForWorkbookSheet = function(sheet) {
  if (!sheet || sheet.getName().indexOf(HONEYPOT_SHEET_PREFIX) === 0 || sheet.getName() === SITE_CONFIG_SHEET_NAME) return "";
  if (Object.keys(SYSTEM_SHEETS).some(function(key) { return SYSTEM_SHEETS[key] === sheet.getName(); })) return "";
  try { return normalizeSite(sheet.getName()); } catch (error) {}
  if (sheet.getLastRow() < 2 || !sheet.getLastColumn()) return "";
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var sourceIndex = -1;
  headers.forEach(function(header, index) {
    if (canonicalHeader(header) === canonicalHeader(METADATA_HEADERS[2])) sourceIndex = index;
  });
  if (sourceIndex < 0) return "";
  try {
    return normalizeSite(sheet.getRange(2, sourceIndex + 1).getValues()[0][0]);
  } catch (error) {
    return "";
  }
}

var ensureSiteConfigRowsForWebsiteSheets = function(spreadsheet) {
  spreadsheet.getSheets().forEach(function(sheet) {
    var site = siteNameForWorkbookSheet(sheet);
    if (site) ensureSiteConfigRow(spreadsheet, site);
  });
}

var inspectSiteConfig = function(spreadsheet) {
  var result = { configuredSiteCount: 0, disabledSiteCount: 0, invalidRows: [], duplicateSites: [] };
  var sheet = spreadsheet.getSheetByName(SITE_CONFIG_SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return result;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, SITE_CONFIG_HEADERS.length).getValues();
  var seen = Object.create(null);
  rows.forEach(function(row, index) {
    var rawSite = String(row[0] || "").trim();
    if (!rawSite) return;
    var site;
    try {
      site = normalizeSite(rawSite);
    } catch (error) {
      result.invalidRows.push(index + 2);
      return;
    }
    if (seen[site]) result.duplicateSites.push(site);
    seen[site] = true;
    result.configuredSiteCount++;
    var enabled = parseSiteConfigBoolean(row[2], true);
    var sendConfirmation = parseSiteConfigBoolean(row[3], CONFIG.SEND_CONFIRMATION_EMAILS === true);
    var showNotification = parseSiteConfigBoolean(row[4], CONFIG.SHOW_CONFIRMATION_NOTIFICATION !== false);
    var submissionSheet = parseSubmissionSheet(row[5], site);
    var invalid = !enabled.valid || !sendConfirmation.valid || !showNotification.valid || !submissionSheet.valid;
    if (!enabled.value) result.disabledSiteCount++;
    if (enabled.value && !normalizeRecipients(row[1]).valid.length) invalid = true;
    if (invalid) result.invalidRows.push(index + 2);
  });
  return result;
}

// Queue creation persists enough information to rebuild the notification
// message later, even if the original Web App execution has ended.
var enqueueNotification = function(spreadsheet, item) {
  // The queue stores one state object per recipient. This is deliberately more
  // verbose than one BCC message because each address can retry independently.
  var queue = spreadsheet.getSheetByName(SYSTEM_SHEETS.QUEUE);
  if (queue.getLastRow() >= DEFAULTS.MAX_QUEUE_ROWS) {
    throw appError("pending_notification_limit", "The notification queue is full.", true);
  }
  var queueId = Utilities.getUuid();
  var states = item.recipients.map(function (recipient) {
    var entry = typeof recipient === "string" ? { email: recipient, kind: "notification" } : recipient;
    return {
      email: entry.email,
      kind: entry.kind || "notification",
      status: "pending",
      attempts: 0,
      nextAttemptAt: 0,
      lastError: ""
    };
  });
  queue.appendRow([
    queueId,
    item.submissionKey,
    item.sheetName,
    item.sheetRow,
    item.submissionId,
    item.sourceSite,
    item.createdAt,
    "pending",
    0,
    "",
    "",
    "",
    JSON.stringify(states),
    item.createdAt
  ]);
  // The queue row is the durable outbox record. If maintenance metadata or a
  // trigger service is temporarily unavailable after this append, do not turn
  // a successful durable write into a false queue error. The worker can
  // recalculate the pending counter and the next scheduled run can continue.
  try {
    setPendingCount(getPendingCount() + 1);
  } catch (counterError) {
    safeLog("pending_count_update_failure", normalizeError(counterError).code);
  }
  try {
    scheduleNotificationRecovery();
  } catch (triggerError) {
    safeLog("recovery_trigger_schedule_failure", normalizeError(triggerError).code);
  }
}

/**
 * Adds one coalesced safety execution for the current queue burst. The normal
 * five-minute trigger remains primary; this one-time trigger only protects
 * against a missed, delayed, or failed scheduled run.
 */
var scheduleNotificationRecovery = function() {
  try {
    var properties = PropertiesService.getScriptProperties();
    var now = new Date().getTime();
    var scheduledAt = Number(properties.getProperty(PROP.RECOVERY_TRIGGER_AT) || 0);
    if (scheduledAt > now) return;
    if (typeof ScriptApp === "undefined" || !ScriptApp.newTrigger) return;
    var triggerBuilder = ScriptApp.newTrigger("processPendingNotifications").timeBased();
    if (!triggerBuilder || typeof triggerBuilder.after !== "function") return;
    var trigger = triggerBuilder.after(DEFAULTS.RECOVERY_TRIGGER_DELAY_MS).create();
    if (trigger && typeof trigger.getUniqueId === "function") {
      properties.setProperty(PROP.RECOVERY_TRIGGER_ID, String(trigger.getUniqueId()));
    }
    properties.setProperty(
      PROP.RECOVERY_TRIGGER_AT,
      String(now + DEFAULTS.RECOVERY_TRIGGER_DELAY_MS)
    );
  } catch (error) {
    safeLog("recovery_trigger_schedule_failure", normalizeError(error).code);
    sendAdminAlert("recovery_trigger_schedule_failure", normalizeError(error).code);
  }
}

var finishNotificationRecovery = function(pendingCount) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.LOCK_WAIT_MS)) return;
  try {
    // Re-read under the shared lock. A submission can arrive while the worker
    // is finishing; never delete its recovery trigger based on an old count.
    var currentPendingCount = getPendingCount();
    if (currentPendingCount > 0 || pendingCount > 0) {
      scheduleNotificationRecovery();
      return;
    }
    var recoveryId = PropertiesService.getScriptProperties().getProperty(PROP.RECOVERY_TRIGGER_ID);
    if (recoveryId && typeof ScriptApp !== "undefined" && ScriptApp.getProjectTriggers) {
      ScriptApp.getProjectTriggers().forEach(function(trigger) {
        if (typeof trigger.getUniqueId === "function" && String(trigger.getUniqueId()) === String(recoveryId)) {
          ScriptApp.deleteTrigger(trigger);
        }
      });
    }
    PropertiesService.getScriptProperties().deleteProperty(PROP.RECOVERY_TRIGGER_AT);
    PropertiesService.getScriptProperties().deleteProperty(PROP.RECOVERY_TRIGGER_ID);
  } catch (error) {
    safeLog("recovery_trigger_state_failure", normalizeError(error).code);
  } finally {
    lock.releaseLock();
  }
}

var findIdempotencyRecord = function(key) {
  var property = PropertiesService.getScriptProperties().getProperty(PROP.IDEM_PREFIX + key);
  if (!property) return null;
  try {
    return JSON.parse(property);
  } catch (error) {
    return null;
  }
}

var setIdempotencyRecord = function(key, record) {
  PropertiesService.getScriptProperties().setProperty(PROP.IDEM_PREFIX + key, JSON.stringify(record));
}

var getPendingCount = function() {
  var value = Number(PropertiesService.getScriptProperties().getProperty(PROP.PENDING_COUNT) || 0);
  return isFinite(value) && value > 0 ? value : 0;
}

var setPendingCount = function(value) {
  PropertiesService.getScriptProperties().setProperty(PROP.PENDING_COUNT, String(Math.max(0, value)));
}

var enforceRateLimit = function(site) {
  var cache = CacheService.getScriptCache();
  var key = "fh_rate_" + sha256(site).substring(0, 24);
  var now = new Date().getTime();
  var current = null;
  try {
    current = JSON.parse(cache.get(key) || "null");
  } catch (error) {
    current = null;
  }
  var startedAt = current ? Number(current.startedAt) : NaN;
  var count = current ? Number(current.count) : NaN;
  if (!current || !isFinite(startedAt) || !isFinite(count) || count < 0 || now - startedAt >= DEFAULTS.RATE_WINDOW_MS) {
    cache.put(key, JSON.stringify({ startedAt: now, count: 1 }), 120);
    return;
  }
  if (count >= DEFAULTS.MAX_REQUESTS_PER_SITE_WINDOW) {
    throw appError("rate_limited", "Too many submissions were received. Retry later.", true);
  }
  current.count = count + 1;
  cache.put(key, JSON.stringify(current), 120);
}

var getHoneypotSheetLink = function(spreadsheet, sheet) {
  var baseUrl = "";
  try {
    if (spreadsheet && typeof spreadsheet.getUrl === "function") baseUrl = spreadsheet.getUrl();
  } catch (error) {
    baseUrl = "";
  }
  if (!baseUrl) baseUrl = "https://docs.google.com/spreadsheets/d/" + encodeURIComponent(CONFIG.SPREADSHEET_ID) + "/edit";
  return baseUrl + "#gid=" + encodeURIComponent(sheet.getSheetId());
}

var setHoneypotMailStatus = function(sheet, rowNumbers, status) {
  if (!sheet || !rowNumbers.length) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var statusIndex = -1;
  headers.forEach(function(header, index) {
    if (canonicalHeader(header) === canonicalHeader(HONEYPOT_MAILED_STATUS_HEADER)) statusIndex = index;
  });
  if (statusIndex < 0) return;
  rowNumbers.forEach(function(rowNumber) {
    if (rowNumber >= 2 && rowNumber <= sheet.getLastRow()) sheet.getRange(rowNumber, statusIndex + 1).setValue(status);
  });
}

var getUnreadHoneypotSummary = function(spreadsheet, site) {
  var sheet = spreadsheet.getSheetByName(honeypotTabName(site));
  if (!sheet) return null;
  var now = new Date().getTime();
  var records = readHoneypotRecords(sheet).filter(function(record) {
    return String(record.readStatus).toLowerCase() !== String(HONEYPOT_READ_READ).toLowerCase() &&
      record.deadlineAt > now;
  });
  return {
    count: records.length,
    sheet: sheet,
    link: getHoneypotSheetLink(spreadsheet, sheet),
    records: records
  };
}

/** Creates one durable queue item per due website/window digest. */
var enqueueDueHoneypotDigests = function() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.LOCK_WAIT_MS)) return 0;
  try {
    var spreadsheet = openConfiguredSpreadsheet();
    ensureRuntimeSystemSheets(spreadsheet);
    var now = new Date().getTime();
    var queued = 0;
    spreadsheet.getSheets().forEach(function(sheet) {
      if (sheet.getName().indexOf(HONEYPOT_SHEET_PREFIX) !== 0) return;
      var records = readHoneypotRecords(sheet);
      var groups = Object.create(null);
      var pendingReadRows = [];
      records.forEach(function(record) {
        var isRead = String(record.readStatus).toLowerCase() === String(HONEYPOT_READ_READ).toLowerCase();
        if (isRead) {
          if (record.mailedStatus === HONEYPOT_MAIL_PENDING) pendingReadRows.push(record.rowNumber);
          return;
        }
        if (record.deadlineAt <= now && record.windowId && record.mailedStatus === HONEYPOT_MAIL_PENDING) {
          if (!groups[record.windowId]) groups[record.windowId] = [];
          groups[record.windowId].push(record);
        }
      });
      setHoneypotMailStatus(sheet, pendingReadRows, HONEYPOT_MAIL_NOT_REQUIRED);
      Object.keys(groups).forEach(function(windowId) {
        var group = groups[windowId];
        var site = honeypotRecordField(group[0], "_site") || sheet.getName().substring(HONEYPOT_SHEET_PREFIX.length);
        var recipients = getSiteNotificationRecipients(spreadsheet, site);
        if (!recipients.valid.length || getPendingCount() >= DEFAULTS.MAX_PENDING_NOTIFICATIONS) {
          setHoneypotMailStatus(sheet, group.map(function(record) { return record.rowNumber; }), HONEYPOT_MAIL_FAILED);
          safeLog("honeypot_digest_deferred", "site=" + site + " source=" + recipients.source);
          return;
        }
        try {
          enqueueNotification(spreadsheet, {
            submissionKey: "honeypot|" + sheet.getName() + "|" + windowId,
            sheetName: sheet.getName(),
            sheetRow: group[0].rowNumber,
            submissionId: windowId,
            sourceSite: site,
            recipients: recipients.valid.map(function(email) {
              return { email: email, kind: "honeypot_digest" };
            }),
            createdAt: formatIst(new Date())
          });
          setHoneypotMailStatus(sheet, group.map(function(record) { return record.rowNumber; }), HONEYPOT_MAIL_QUEUED);
          queued++;
        } catch (error) {
          safeLog("honeypot_digest_queue_failure", normalizeError(error).code);
        }
      });
    });
    return queued;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Rebuilds notification queue work for rows that were durably written before
 * the queue append or the row-status update completed. This is the critical
 * outbox-recovery path: a visitor's accepted data remains in the website tab,
 * and a later worker run can reconstruct the notification from that row.
 *
 * The scan is deliberately bounded and runs only in the worker, never in the
 * public request path. Existing queue locations are indexed first so a crash
 * after appendRow() cannot create a duplicate queue item.
 */
var recoverDeferredSubmissions = function() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.LOCK_WAIT_MS)) return 0;
  try {
    var spreadsheet = openConfiguredSpreadsheet();
    ensureRuntimeSystemSheets(spreadsheet);
    // Repair a stale counter before deciding whether a deferred row can enter
    // the bounded queue. This is cheap worker-only maintenance and prevents a
    // failed counter update from blocking otherwise recoverable work forever.
    recalculatePendingCount(spreadsheet);
    var queue = spreadsheet.getSheetByName(SYSTEM_SHEETS.QUEUE);
    var locations = Object.create(null);
    if (queue && queue.getLastRow() >= 2) {
      var queueRows = queue.getRange(2, 1, queue.getLastRow() - 1, QUEUE_HEADERS.length).getValues();
      queueRows.forEach(function(row) {
        var sheetName = String(row[2] || "");
        var sheetRow = Number(row[3] || 0);
        if (!sheetName || !isFinite(sheetRow) || sheetRow < 2) return;
        var key = sheetName + "|" + sheetRow;
        locations[key] = String(row[7] || "");
      });
    }

    var queued = 0;
    spreadsheet.getSheets().forEach(function(sheet) {
      if (queued >= DEFAULTS.MAX_DEFERRED_RECOVERY_ROWS) return;
      var sheetName = sheet.getName();
      if (sheetName === SITE_CONFIG_SHEET_NAME ||
          Object.keys(SYSTEM_SHEETS).some(function(key) { return SYSTEM_SHEETS[key] === sheetName; }) ||
          sheetName.indexOf(HONEYPOT_SHEET_PREFIX) === 0) return;
      if (sheet.getLastRow() < 2 || !sheet.getLastColumn()) return;

      var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      var positions = Object.create(null);
      headers.forEach(function(header, index) {
        var key = schemaHeaderKey(header);
        if (key) positions[key] = index;
      });
      var statusIndex = positions[canonicalHeader(METADATA_HEADERS[3])];
      if (statusIndex === undefined) return;
      var sourceIndex = positions[canonicalHeader(METADATA_HEADERS[2])];
      var idIndex = positions[canonicalHeader(METADATA_HEADERS[0])];
      var timestampIndex = positions[canonicalHeader(TIMESTAMP_HEADER)];
      var values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues();

      values.forEach(function(row, offset) {
        if (queued >= DEFAULTS.MAX_DEFERRED_RECOVERY_ROWS) return;
        var rowNumber = offset + 2;
        var status = String(row[statusIndex] || "").trim();
        if (["stored", "deferred_queue_full", "deferred_queue_error"].indexOf(status) < 0) return;

        var locationKey = sheetName + "|" + rowNumber;
        if (locations[locationKey]) {
          // If the queue already reached a terminal state but the website-row
          // status update failed, repair the visible status without re-mailing.
          if (["sent", "failed", "partial_failed"].indexOf(locations[locationKey]) >= 0) {
            updateSiteNotificationStatusByLocation(spreadsheet, sheetName, rowNumber, locations[locationKey]);
          }
          return;
        }
        if (getPendingCount() >= DEFAULTS.MAX_PENDING_NOTIFICATIONS) return;

        var sourceSite = sourceIndex === undefined ? "" : String(row[sourceIndex] || "").trim();
        if (!sourceSite) {
          try { sourceSite = normalizeSite(sheetName); } catch (siteError) { return; }
        } else {
          try { sourceSite = normalizeSite(sourceSite); } catch (siteError) { return; }
        }
        var configuration = getSiteConfiguration(spreadsheet, sourceSite);
        var recipients = configuration.recipients && configuration.recipients.valid
          ? configuration.recipients.valid.slice()
          : [];
        var fields = Object.create(null);
        headers.forEach(function(header, index) {
          if (!header || isReservedMetadataHeader(header)) return;
          var key = canonicalHeader(header);
          fields[key] = { displayName: String(header), values: [String(row[index] || "")] };
        });
        var confirmationEmail = configuration.sendConfirmationEmails ? findConfirmationEmail(fields) : "";
        var queuedRecipients = confirmationEmail
          ? [{ email: confirmationEmail, kind: "confirmation" }]
          : [];
        queuedRecipients = queuedRecipients.concat(recipients.map(function(email) {
          return { email: email, kind: "notification" };
        }));
        // Keep the deferred state recoverable if configuration was temporarily
        // disabled or invalid. An administrator can fix the config sheet and a
        // later worker run will retry the same persisted row.
        if (!queuedRecipients.length) {
          safeLog("deferred_recovery_no_recipients", "site=" + sourceSite + " row=" + rowNumber);
          return;
        }

        var submissionId = idIndex === undefined ? "" : String(row[idIndex] || "").trim();
        if (!submissionId) submissionId = "recovered-" + sha256(sheetName + "|" + rowNumber).substring(0, 16);
        var createdAt = timestampIndex === undefined ? formatIst(new Date()) : String(row[timestampIndex] || formatIst(new Date()));
        try {
          enqueueNotification(spreadsheet, {
            // Location-based duplicate protection above is the source of truth
            // for this recovery path; the key is still useful in diagnostics.
            submissionKey: "recovery|" + sheetName + "|" + rowNumber,
            sheetName: sheetName,
            sheetRow: rowNumber,
            submissionId: submissionId,
            sourceSite: sourceSite,
            recipients: queuedRecipients,
            createdAt: createdAt
          });
          updateSiteNotificationStatusByLocation(spreadsheet, sheetName, rowNumber, "queued");
          locations[locationKey] = "pending";
          queued++;
        } catch (error) {
          // Leave the row's deferred status intact. The next bounded worker run
          // can retry after a full queue, temporary Sheet error, or quota issue.
          safeLog("deferred_recovery_queue_failure", normalizeError(error).code);
        }
      });
    });
    if (queued) SpreadsheetApp.flush();
    return queued;
  } finally {
    lock.releaseLock();
  }
}

// The worker claims exactly one recipient at a time, sends without holding a
// spreadsheet lock, and finalizes the state under a new bounded lock.
/**
 * Processes a bounded number of individual recipient deliveries. The time
 * budget and recipient cap protect Apps Script execution limits; unprocessed
 * queue records remain durable for the next trigger run.
 */
function processPendingNotifications(maxItems) {
  var processed = 0;
  var quotaBlocked = false;
  var deferredSubmissionsQueued = 0;
  var honeypotDigestsQueued = 0;
  try {
    cleanupQueueHistory();
    try {
      // Property maintenance is deliberately outside the visitor request path.
      maybeCleanupIdempotency();
    } catch (cleanupError) {
      safeLog("idempotency_cleanup_failure", normalizeError(cleanupError).code);
    }
    try {
      deferredSubmissionsQueued = recoverDeferredSubmissions();
    } catch (deferredRecoveryError) {
      safeLog("deferred_recovery_scan_failure", normalizeError(deferredRecoveryError).code);
    }
    try {
      honeypotDigestsQueued = enqueueDueHoneypotDigests();
    } catch (honeypotQueueError) {
      safeLog("honeypot_digest_scan_failure", normalizeError(honeypotQueueError).code);
    }
    var startedAt = new Date().getTime();
    var emptyClaimPasses = 0;
    var itemLimit = Number(maxItems);
    if (!isFinite(itemLimit) || itemLimit <= 0) itemLimit = DEFAULTS.MAX_EMAILS_PER_RUN;
    itemLimit = Math.min(DEFAULTS.MAX_EMAILS_PER_RUN, Math.floor(itemLimit));
    for (var i = 0; i < itemLimit; i++) {
      if (new Date().getTime() - startedAt >= DEFAULTS.WORKER_TIME_BUDGET_MS) break;
      var claim = claimNextNotification();
      if (!claim) {
        // The queue cursor can reach the end while an earlier row still has
        // another recipient pending. Allow one bounded second pass so a normal
        // worker run does not unnecessarily defer that recipient until the next
        // scheduled trigger.
        emptyClaimPasses++;
        if (emptyClaimPasses >= 2) break;
        continue;
      }
      emptyClaimPasses = 0;
      if (claim.quotaBlocked) {
        quotaBlocked = true;
        safeLog("quota_limited", "notification worker paused");
        break;
      }
      var outcome = { success: false, error: "" };
      try {
        var email = buildNotificationEmail(claim);
        if (email && email.skipSend) {
          outcome.skipped = true;
        } else {
          MailApp.sendEmail({
            to: claim.email,
            subject: email.subject,
            body: email.body,
            htmlBody: email.htmlBody,
            name: DEFAULTS.NOTIFICATION_SENDER_NAME
          });
        }
        outcome.success = true;
      } catch (error) {
        outcome.error = safeErrorText(error);
      }
      finalizeNotificationClaim(claim, outcome);
      processed++;
    }
    var result = {
      processed: processed,
      deferredSubmissionsQueued: deferredSubmissionsQueued,
      honeypotDigestsQueued: honeypotDigestsQueued,
      quotaBlocked: quotaBlocked
    };
    finishNotificationRecovery(getPendingCount());
    Logger.log(JSON.stringify(result));
    return result;
  } catch (error) {
    var safeError = normalizeError(error);
    safeLog("notification_worker_failure", safeError.code);
    // If this execution failed before it could finish recovery bookkeeping,
    // request another bounded safety run instead of waiting for the next
    // five-minute primary trigger.
    scheduleNotificationRecovery();
    sendAdminAlert("notification_worker_failure", safeError.code);
    var failure = {
      processed: processed,
      deferredSubmissionsQueued: deferredSubmissionsQueued,
      honeypotDigestsQueued: honeypotDigestsQueued,
      quotaBlocked: quotaBlocked,
      error: safeError.code
    };
    Logger.log(JSON.stringify(failure));
    return failure;
  }
}

/** Claims one eligible recipient and creates a lease before releasing the lock. */
var claimNextNotification = function() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.LOCK_WAIT_MS)) return null;
  try {
    var spreadsheet = openConfiguredSpreadsheet();
    ensureRuntimeSystemSheets(spreadsheet);
    var queue = spreadsheet.getSheetByName(SYSTEM_SHEETS.QUEUE);
    var lastRow = queue.getLastRow();
    if (lastRow < 2) return null;
    var properties = PropertiesService.getScriptProperties();
    var cursor = Number(properties.getProperty(PROP.QUEUE_CURSOR) || 2);
    if (cursor < 2 || cursor > lastRow) cursor = 2;
    var end = Math.min(lastRow, cursor + DEFAULTS.MAX_QUEUE_SCAN_ROWS - 1);
    var rows = queue.getRange(cursor, 1, end - cursor + 1, QUEUE_HEADERS.length).getValues();
    var now = new Date().getTime();
    for (var offset = 0; offset < rows.length; offset++) {
      var rowNumber = cursor + offset;
      var row = rows[offset];
      var status = String(row[7] || "");
      if (["pending", "retry", "processing", "partial_retry"].indexOf(status) < 0) continue;
      var states;
      try {
        states = JSON.parse(String(row[12] || "[]"));
      } catch (error) {
        markQueueRowFailed(queue, rowNumber, row, "recipient_state_corrupt");
        setPendingCount(getPendingCount() - 1);
        updateSiteNotificationStatusByLocation(spreadsheet, String(row[2]), Number(row[3]), "failed");
        continue;
      }
      var changed = recoverExpiredRecipient(states, now);
      if (changed) {
        row[7] = aggregateQueueStatus(states);
        row[10] = "";
        row[12] = JSON.stringify(states);
        row[13] = formatIst(new Date());
        queue.getRange(rowNumber, 1, 1, QUEUE_HEADERS.length).setValues([row]);
        status = String(row[7]);
      }
      var recipientIndex = findEligibleRecipient(states, now);
      if (recipientIndex < 0) {
        if (isTerminalStates(states)) finalizeTerminalQueueRow(spreadsheet, queue, rowNumber, row, states);
        continue;
      }
      if (getQuotaBudget(1) < 1) return { quotaBlocked: true };

      var recipient = states[recipientIndex];
      var token = Utilities.getUuid();
      recipient.status = "processing";
      recipient.processingUntil = now + DEFAULTS.PROCESSING_LEASE_MS;
      recipient.claimToken = token;
      row[7] = "processing";
      row[10] = new Date(now + DEFAULTS.PROCESSING_LEASE_MS);
      row[12] = JSON.stringify(states);
      row[13] = formatIst(new Date());
      queue.getRange(rowNumber, 1, 1, QUEUE_HEADERS.length).setValues([row]);
      reserveQuota(token, now);
      properties.setProperty(PROP.QUEUE_CURSOR, String(rowNumber + 1 > lastRow ? 2 : rowNumber + 1));
      SpreadsheetApp.flush();
      return {
        quotaBlocked: false,
        queueRow: rowNumber,
        queueId: String(row[0]),
        email: recipient.email,
        recipientKind: recipient.kind || "notification",
        recipientIndex: recipientIndex,
        claimToken: token,
        sheetName: String(row[2]),
        sheetRow: Number(row[3]),
        submissionId: String(row[4]),
        sourceSite: String(row[5]),
        submissionKey: String(row[1])
      };

    }
    properties.setProperty(PROP.QUEUE_CURSOR, String(end >= lastRow ? 2 : end + 1));
    return null;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Protects a website tab's header row and operational columns. Protections are
 * recreated on every schema pass so adding a new user field cannot leave an
 * old protection covering the wrong column.
 */
var protectSiteStructure = function(sheet, headers) {
  protectHeaderRow(sheet, headers);
  protectMetadataColumns(sheet, headers);
  rememberSheetStructure(sheet, headers, "site");
};

/** Honeypot tabs keep review status editable while locking system-managed columns. */
var protectHoneypotStructure = function(sheet, headers) {
  protectHeaderRow(sheet, headers);
  protectHoneypotMetadataColumns(sheet, headers);
  // Remove legacy full-column validation before restoring it only for rows
  // that already contain data. Newly appended rows are handled separately.
  clearHoneypotReadValidation(sheet, headers);
  applyHoneypotReadValidation(sheet, headers);
  rememberSheetStructure(sheet, headers, "honeypot");
};

var removeManagedProtection = function(sheet, description) {
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function(protection) {
    if (String(protection.getDescription() || "") === description) protection.remove();
  });
};

/** Returns whether a header belongs to a FormHarbour-managed system column. */
var isSystemColumnHeader = function(sheet, header) {
  var sheetName = sheet.getName();
  if (sheetName === SITE_CONFIG_SHEET_NAME ||
      Object.keys(SYSTEM_SHEETS).some(function(key) { return SYSTEM_SHEETS[key] === sheetName; })) {
    return true;
  }
  var canonical = schemaHeaderKey(header);
  if (canonical === canonicalHeader(TIMESTAMP_HEADER) || canonical.indexOf("__fh_") === 0) return true;
  if (sheetName.indexOf(HONEYPOT_SHEET_PREFIX) === 0) {
    return HONEYPOT_MANAGED_HEADERS.concat(HONEYPOT_SYSTEM_HEADERS).some(function(systemHeader) {
      return canonical === canonicalHeader(systemHeader);
    });
  }
  return false;
};

/** Auto-sizes only managed columns, keeping formatting work bounded. */
var autoResizeSystemColumns = function(sheet, headers) {
  if (!sheet || !headers || !headers.length) return;
  var columns = headers.map(function(header, index) {
    return isSystemColumnHeader(sheet, header) ? index + 1 : 0;
  }).filter(function(column) { return column > 0; });
  if (!columns.length) return;

  // Merge adjacent columns so Sheets receives the fewest formatting calls.
  var ranges = [];
  columns.forEach(function(column) {
    var last = ranges[ranges.length - 1];
    if (last && last.start + last.count === column) {
      last.count++;
    } else {
      ranges.push({ start: column, count: 1 });
    }
  });
  ranges.forEach(function(range) {
    if (typeof sheet.autoResizeColumns === "function") {
      sheet.autoResizeColumns(range.start, range.count);
    } else if (typeof sheet.autoResizeColumn === "function") {
      for (var column = range.start; column < range.start + range.count; column++) {
        sheet.autoResizeColumn(column);
      }
    }
  });

  // Google Sheets can keep a wrapped header column too narrow after
  // auto-resizing. Enforce a readable minimum derived from the header text.
  headers.forEach(function(header, index) {
    if (!isSystemColumnHeader(sheet, header) || typeof sheet.setColumnWidth !== "function") return;
    var minimumWidth = Math.min(420, Math.max(120, String(header || "").length * 8 + 24));
    var currentWidth = typeof sheet.getColumnWidth === "function"
      ? Number(sheet.getColumnWidth(index + 1) || 0)
      : 0;
    if (!currentWidth || currentWidth < minimumWidth) {
      sheet.setColumnWidth(index + 1, minimumWidth);
    }
  });
};

/** Resizes every managed system-column set during setup or maintenance. */
var resizeAllManagedSystemColumns = function(spreadsheet) {
  spreadsheet.getSheets().forEach(function(sheet) {
    if (!sheet.getLastColumn()) return;
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    autoResizeSystemColumns(sheet, headers);
  });
};

/** Prevents manual changes to the header row while allowing the script owner to update it. */
var protectHeaderRow = function(sheet, headers, description) {
  var protectionDescription = description || HEADER_PROTECTION_DESCRIPTION;
  var styleKind = sheet.getName() === SITE_CONFIG_SHEET_NAME
    ? "config"
    : (sheet.getName().indexOf(HONEYPOT_SHEET_PREFIX) === 0
      ? "honeypot"
      : (protectionDescription === SYSTEM_HEADER_PROTECTION_DESCRIPTION ? "system" : "site"));
  var style = HEADER_STYLES[styleKind] || HEADER_STYLES.site;
  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  // Keep all managed pages visually consistent while preserving the existing
  // header protection and schema behavior.
  if (headerRange.setBackground) headerRange.setBackground(style.background);
  if (headerRange.setFontColor) headerRange.setFontColor(style.font);
  if (headerRange.setFontWeight) headerRange.setFontWeight("bold");
  if (headerRange.setHorizontalAlignment) headerRange.setHorizontalAlignment("center");
  if (headerRange.setVerticalAlignment) headerRange.setVerticalAlignment("middle");
  if (headerRange.setWrap) headerRange.setWrap(false);
  removeManagedProtection(sheet, protectionDescription);
  var protection = headerRange.protect()
    .setDescription(protectionDescription);
  protection.setWarningOnly(false);
  try {
    var effectiveUser = Session.getEffectiveUser();
    protection.addEditor(effectiveUser);
    var editors = protection.getEditors();
    var otherEditors = editors.filter(function(editor) {
      return editor.getEmail() !== effectiveUser.getEmail();
    });
    if (otherEditors.length) protection.removeEditors(otherEditors);
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (protectionError) {
    throw appError("header_protection_failed", "The website header row could not be protected.", true);
  }
};

/** Keeps internal operational sheets read-only to everyone except the script owner. */
var protectSystemSheet = function(sheet) {
  var protectionType = SpreadsheetApp.ProtectionType.RANGE;
  var alreadyProtected = sheet.getProtections(protectionType).some(function(protection) {
    return String(protection.getDescription() || "") === SYSTEM_SHEET_PROTECTION_DESCRIPTION;
  });
  if (alreadyProtected) return;
  removeManagedProtection(sheet, SYSTEM_SHEET_PROTECTION_DESCRIPTION);
  var protection = sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).protect()
    .setDescription(SYSTEM_SHEET_PROTECTION_DESCRIPTION);
  protection.setWarningOnly(false);
  try {
    var effectiveUser = Session.getEffectiveUser();
    protection.addEditor(effectiveUser);
    var editors = protection.getEditors();
    var otherEditors = editors.filter(function(editor) {
      return editor.getEmail() !== effectiveUser.getEmail();
    });
    if (otherEditors.length) protection.removeEditors(otherEditors);
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  } catch (protectionError) {
    throw appError("system_sheet_protection_failed", "An internal system sheet could not be protected.", true);
  }
};

var protectHoneypotMetadataColumns = function(sheet, headers) {
  var protectionType = SpreadsheetApp.ProtectionType.RANGE;
  sheet.getProtections(protectionType).forEach(function(protection) {
    if (String(protection.getDescription() || "").indexOf("FormHarbour honeypot metadata: ") === 0) {
      protection.remove();
    }
  });

  [HONEYPOT_MAILED_STATUS_HEADER, HONEYPOT_WINDOW_ID_HEADER, HONEYPOT_WINDOW_DEADLINE_HEADER].forEach(function(header) {
    var wanted = canonicalHeader(header);
    var columnIndex = -1;
    headers.forEach(function(currentHeader, index) {
      if (canonicalHeader(currentHeader) === wanted) columnIndex = index;
    });
    if (columnIndex < 0) throw appError("honeypot_metadata_protection_failed", "Honeypot status columns could not be protected.", true);
    var protection = sheet.getRange(columnToLetter(columnIndex + 1) + ":" + columnToLetter(columnIndex + 1))
      .protect()
      .setDescription("FormHarbour honeypot metadata: " + header);
    protection.setWarningOnly(false);
    try {
      var effectiveUser = Session.getEffectiveUser();
      protection.addEditor(effectiveUser);
      var editors = protection.getEditors();
      var otherEditors = editors.filter(function(editor) {
        return editor.getEmail() !== effectiveUser.getEmail();
      });
      if (otherEditors.length) protection.removeEditors(otherEditors);
      if (protection.canDomainEdit()) protection.setDomainEdit(false);
    } catch (protectionError) {
      throw appError("honeypot_metadata_protection_failed", "Honeypot status columns could not be protected.", true);
    }
  });
};

/**
 * Protects the three operational columns from manual edits. Protections are
 * recreated on every schema pass so adding a new user field before metadata
 * cannot leave an old protection covering the wrong column.
 */
var protectMetadataColumns = function(sheet, headers) {
  var protectionType = SpreadsheetApp.ProtectionType.RANGE;
  var existing = sheet.getProtections(protectionType);
  existing.forEach(function(protection) {
    if (String(protection.getDescription() || "").indexOf(PROTECTION_DESCRIPTION_PREFIX) === 0) {
      protection.remove();
    }
  });

  PROTECTED_METADATA_HEADERS.forEach(function(header) {
    var wanted = schemaHeaderKey(header);
    var columnIndex = -1;
    headers.forEach(function(currentHeader, index) {
      if (schemaHeaderKey(currentHeader) === wanted) columnIndex = index;
    });
    if (columnIndex < 0) {
      throw appError("metadata_protection_failed", "Reserved metadata columns could not be protected.", true);
    }

    var protection = sheet.getRange(columnToLetter(columnIndex + 1) + ":" + columnToLetter(columnIndex + 1))
      .protect()
      .setDescription(PROTECTION_DESCRIPTION_PREFIX + header);
    protection.setWarningOnly(false);

    try {
      var effectiveUser = Session.getEffectiveUser();
      protection.addEditor(effectiveUser);
      var editors = protection.getEditors();
      var otherEditors = editors.filter(function(editor) {
        return editor.getEmail() !== effectiveUser.getEmail();
      });
      if (otherEditors.length) protection.removeEditors(otherEditors);
      if (protection.canDomainEdit()) protection.setDomainEdit(false);
    } catch (protectionError) {
      throw appError("metadata_protection_failed", "Reserved metadata columns could not be protected.", true);
    }
  });
};

/** Converts a one-based column number to an A1 column label. */
var columnToLetter = function(columnNumber) {
  var label = "";
  var number = columnNumber;
  while (number > 0) {
    var remainder = (number - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    number = Math.floor((number - 1) / 26);
  }
  return label;
};

var recoverExpiredRecipient = function(states, now) {
  var changed = false;
  states.forEach(function (recipient) {
    if (recipient.status === "processing" && Number(recipient.processingUntil || 0) <= now) {
      recipient.status = "retry";
      recipient.nextAttemptAt = now;
      recipient.lastError = "processing lease expired";
      delete recipient.processingUntil;
      delete recipient.claimToken;
      changed = true;
    }
  });
  return changed;
}

var findEligibleRecipient = function(states, now) {
  for (var i = 0; i < states.length; i++) {
    var state = states[i];
    if ((state.status === "pending" || state.status === "retry") && Number(state.nextAttemptAt || 0) <= now) return i;
  }
  return -1;
}

/**
 * Commits the result of a send attempt. A missing/expired lease is left for
 * normal recovery so an interrupted worker cannot overwrite a newer claim.
 */
var finalizeNotificationClaim = function(claim, outcome) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.LOCK_WAIT_MS)) return;
  try {
    var spreadsheet = openConfiguredSpreadsheet();
    ensureRuntimeSystemSheets(spreadsheet);
    var queue = spreadsheet.getSheetByName(SYSTEM_SHEETS.QUEUE);
    if (!queue || claim.queueRow > queue.getLastRow()) {
      releaseQuota(claim.claimToken, false);
      return;
    }
    var row = queue.getRange(claim.queueRow, 1, 1, QUEUE_HEADERS.length).getValues()[0];
    var states;
    try {
      states = JSON.parse(String(row[12] || "[]"));
    } catch (error) {
      row[7] = "failed";
      row[10] = "";
      row[11] = "recipient_state_corrupt";
      row[13] = formatIst(new Date());
      queue.getRange(claim.queueRow, 1, 1, QUEUE_HEADERS.length).setValues([row]);
      setPendingCount(getPendingCount() - 1);
      if (claim.recipientKind === "honeypot_digest") {
        finalizeHoneypotDigestStatuses(spreadsheet, claim.sheetName, claim.submissionId, "failed");
      } else {
        updateSiteNotificationStatusByLocation(spreadsheet, claim.sheetName, claim.sheetRow, "failed");
      }
      releaseQuota(claim.claimToken, false);
      SpreadsheetApp.flush();
      return;
    }
    var recipient = states[claim.recipientIndex];
    if (!recipient || recipient.claimToken !== claim.claimToken) {
      // A newer worker may have recovered and reclaimed this recipient after
      // the original execution exceeded its lease.
      releaseQuota(claim.claimToken, false);
      return;
    }
    var now = new Date().getTime();
    recipient.attempts = Number(recipient.attempts || 0) + 1;
    delete recipient.processingUntil;
    delete recipient.claimToken;
    if (outcome.success) {
      recipient.status = "sent";
      recipient.sentAt = formatIst(new Date());
      recipient.lastError = "";
      safeLog("notification_sent", "site=" + claim.sourceSite + " recipient_index=" + claim.recipientIndex);
    } else if (recipient.attempts >= DEFAULTS.MAX_RETRIES) {
      recipient.status = "failed";
      recipient.lastError = truncate(outcome.error || "mail failure", 300);
      safeLog("notification_permanent_failure", "site=" + claim.sourceSite + " recipient_index=" + claim.recipientIndex);
    } else {
      recipient.status = "retry";
      recipient.lastError = truncate(outcome.error || "mail failure", 300);
      recipient.nextAttemptAt = now + retryDelay(recipient.attempts);
      safeLog("notification_retry", "site=" + claim.sourceSite + " attempt=" + recipient.attempts);
    }
    row[7] = aggregateQueueStatus(states);
    row[8] = Number(row[8] || 0) + 1;
    row[9] = nextAttemptDate(states);
    row[10] = "";
    row[11] = outcome.success ? "" : truncate(outcome.error || "mail failure", 300);
    row[12] = JSON.stringify(states);
    row[13] = formatIst(new Date());
    queue.getRange(claim.queueRow, 1, 1, QUEUE_HEADERS.length).setValues([row]);
    if (isTerminalStates(states)) {
      setPendingCount(getPendingCount() - 1);
      if (claim.recipientKind === "honeypot_digest") {
        finalizeHoneypotDigestStatuses(spreadsheet, claim.sheetName, claim.submissionId, row[7]);
      } else {
        updateSiteNotificationStatusByLocation(spreadsheet, claim.sheetName, claim.sheetRow, row[7]);
      }
    } else {
      if (claim.recipientKind !== "honeypot_digest") {
        updateSiteNotificationStatusByLocation(spreadsheet, claim.sheetName, claim.sheetRow, row[7]);
      }
    }
    releaseQuota(claim.claimToken, !outcome.skipped);
    SpreadsheetApp.flush();
  } catch (error) {
    safeLog("notification_finalize_failure", normalizeError(error).code);
  } finally {
    lock.releaseLock();
  }
}

var aggregateQueueStatus = function(states) {
  if (!states.length) return "failed";
  var sent = states.filter(function (state) { return state.status === "sent"; }).length;
  var failed = states.filter(function (state) { return state.status === "failed"; }).length;
  var active = states.filter(function (state) {
    return ["pending", "retry", "processing"].indexOf(state.status) >= 0;
  }).length;
  if (active) return sent || failed ? "partial_retry" : "retry";
  if (failed && sent) return "partial_failed";
  if (failed) return "failed";
  return "sent";
}

var isTerminalStates = function(states) {
  return states.every(function (state) { return ["sent", "failed"].indexOf(state.status) >= 0; });
}

var nextAttemptDate = function(states) {
  var times = states.filter(function (state) { return state.status === "retry"; }).map(function (state) {
    return Number(state.nextAttemptAt || 0);
  }).filter(function (time) { return time > 0; });
  return times.length ? new Date(Math.min.apply(Math, times)) : "";
}

var retryDelay = function(attempt) {
  var base = Math.min(6 * 60 * 60 * 1000, 5 * 60 * 1000 * Math.pow(2, Math.max(0, attempt - 1)));
  return base + Math.floor(Math.random() * Math.min(60 * 1000, base / 4));
}

var honeypotRecordField = function(record, fieldName) {
  var wanted = canonicalHeader(fieldName);
  var field = record.fields.find(function(entry) { return canonicalHeader(entry.label) === wanted; });
  return field ? field.value : "";
}

var buildHoneypotDigestEmail = function(claim) {
  var spreadsheet = openConfiguredSpreadsheet();
  var sheet = spreadsheet.getSheetByName(claim.sheetName);
  if (!sheet) throw new Error("honeypot sheet missing");
  var records = readHoneypotRecords(sheet).filter(function(record) {
    return record.windowId === claim.submissionId &&
      String(record.readStatus).toLowerCase() !== String(HONEYPOT_READ_READ).toLowerCase() &&
      [HONEYPOT_MAIL_PENDING, HONEYPOT_MAIL_QUEUED].indexOf(record.mailedStatus) >= 0;
  });
  if (!records.length) return { skipSend: true };

  var site = honeypotRecordField(records[0], "_site") || claim.sourceSite;
  var sheetLink = getHoneypotSheetLink(spreadsheet, sheet);
  var lines = [
    "HONEYPOT REVIEW",
    "================",
    "Website: " + site,
    "Records received: " + records.length,
    "Review sheet: " + sheetLink,
    "",
    "UNREAD RECORDS",
    "=============="
  ];
  var htmlSections = [];
  records.forEach(function(record, index) {
    lines.push("", "Record " + (index + 1) + " | Received (IST): " + record.timestamp);
    record.fields.forEach(function(field) { lines.push(field.label + ": " + (field.value || "(blank)")); });
    var rows = record.fields.map(function(field) {
      return "<tr><th style=\"text-align:left;vertical-align:top;padding:8px;border-bottom:1px solid #e5e7eb;color:#374151;width:30%\">" +
        htmlEscape(field.label) + "</th><td style=\"padding:8px;border-bottom:1px solid #e5e7eb;color:#111827;white-space:pre-wrap;word-break:break-word\">" +
        htmlEscape(field.value || "(blank)").replace(/\n/g, "<br>") + "</td></tr>";
    }).join("");
    htmlSections.push("<section style=\"margin-bottom:22px\"><h3 style=\"margin:0 0 8px;color:#111827\">Record " + (index + 1) + " <span style=\"font-size:13px;font-weight:400;color:#6b7280\">received " + htmlEscape(record.timestamp) + " IST</span></h3><table style=\"width:100%;border-collapse:collapse;border:1px solid #e5e7eb\"><tbody>" + rows + "</tbody></table></section>");
  });
  var body = truncate(lines.join("\n"), DEFAULTS.EMAIL_BODY_LIMIT);
  var htmlBody = "<!doctype html><html><body style=\"margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827\"><div style=\"max-width:760px;margin:0 auto;padding:24px 14px\"><header style=\"background:#7f1d1d;color:#ffffff;border-radius:10px 10px 0 0;padding:24px\"><div style=\"font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#fecaca\">FormHarbour Review</div><h1 style=\"font-size:25px;line-height:1.25;margin:8px 0 0;color:#ffffff\">Unread honeypot records</h1><h2 style=\"font-size:18px;font-weight:400;margin:8px 0 0;color:#fee2e2\">" + htmlEscape(site) + "</h2></header><div style=\"background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;padding:24px\"><p style=\"margin-top:0;color:#4b5563\"><strong>" + records.length + "</strong> record(s) are still unread after the five-day review window.</p>" + htmlSections.join("") + "<p style=\"margin:18px 0 0\"><a href=\"" + htmlEscape(sheetLink) + "\">Open the honeypot sheet</a></p><div style=\"font-size:12px;color:#6b7280;margin-top:20px\">Mark each record’s read status as <strong>Read</strong> in the sheet to complete review.</div></div></div></body></html>";
  return {
    subject: "Honeypot review | " + truncate(site, 120),
    body: body,
    htmlBody: truncate(htmlBody, DEFAULTS.EMAIL_BODY_LIMIT)
  };
}

/**
 * Builds a polished plain-text and HTML message from the persisted sheet row.
 * Admin notifications and submitter confirmations share the same complete
 * data table, but use different headings and subjects. Internal `__fh_`
 * columns are intentionally excluded because they are operational metadata.
 * Long values are truncated with an explicit marker so the message stays
 * within email-size limits without silently dropping a field label.
 */
var buildNotificationEmail = function(claim) {
  if (claim.recipientKind === "honeypot_digest") return buildHoneypotDigestEmail(claim);
  var spreadsheet = openConfiguredSpreadsheet();
  var sheet = spreadsheet.getSheetByName(claim.sheetName);
  if (!sheet) throw new Error("website sheet missing");
  var lastColumn = sheet.getLastColumn();
  if (!lastColumn || claim.sheetRow > sheet.getLastRow()) throw new Error("submission row missing");
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var values = sheet.getRange(claim.sheetRow, 1, 1, lastColumn).getDisplayValues()[0];
  var isConfirmation = claim.recipientKind === "confirmation";
  var messageTitle = isConfirmation ? "Your form submission was saved" : "New Form Submission";
  var messageLabel = isConfirmation ? "FormHarbour Confirmation" : "FormHarbour Notification";
  var styledSiteLink = "<a href=\"https://" + htmlEscape(claim.sourceSite) +
    "\" style=\"color:#e5e7eb !important;text-decoration:underline !important;\">" +
    htmlEscape(claim.sourceSite) + "</a>";
  var timestamp = valueForHeader(headers, values, METADATA_HEADERS[1]) || "Unavailable";
  var fieldEntries = [];
  headers.forEach(function (header, index) {
    if (!header || isReservedMetadataHeader(header)) return;
    fieldEntries.push({
      label: String(header),
      value: String(values[index] || "")
    });
  });

  var lines = [
    isConfirmation ? "FORM SUBMISSION SAVED" : "FORM SUBMISSION",
    "=======================",
    "Website: " + claim.sourceSite,
    "Submission ID: " + claim.submissionId,
    "Received (IST): " + timestamp,
    "Fields received: " + fieldEntries.length,
    "",
    "SUBMITTED DATA",
    "=============="
  ];
  var htmlRows = [];
  var plainLength = lines.join("\n").length;
  // Reserve room for the email wrapper and metadata card when enforcing the
  // HTML size budget; escaped characters can expand beyond raw value length.
  var htmlLength = 4000;
  fieldEntries.forEach(function (entry) {
    var value = truncate(entry.value, DEFAULTS.EMAIL_VALUE_LIMIT);
    var displayValue = value || "(blank)";
    var plainLine = entry.label + ": " + displayValue;
    if (plainLength + plainLine.length + 1 > DEFAULTS.EMAIL_BODY_LIMIT) {
      displayValue = "[value omitted because the email size limit was reached; see the Sheet row]";
      plainLine = entry.label + ": " + displayValue;
    }
    lines.push(plainLine);
    plainLength += plainLine.length + 1;

    var htmlValue = htmlEscape(displayValue).replace(/\n/g, "<br>");
    var htmlRow = "<tr><th scope=\"row\" style=\"text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #e5e7eb;color:#374151;width:30%\">" +
      htmlEscape(entry.label) + "</th><td style=\"padding:10px;border-bottom:1px solid #e5e7eb;color:#111827;white-space:pre-wrap;word-break:break-word\">" +
      htmlValue + "</td></tr>";
    if (htmlLength + htmlRow.length > DEFAULTS.EMAIL_BODY_LIMIT) {
      htmlRow = "<tr><th scope=\"row\" style=\"text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #e5e7eb;color:#374151;width:30%\">" +
        htmlEscape(entry.label) + "</th><td style=\"padding:10px;border-bottom:1px solid #e5e7eb;color:#6b7280\">Value omitted because the email size limit was reached; see the Sheet row.</td></tr>";
    }
    htmlRows.push(htmlRow);
    htmlLength += htmlRow.length;
  });
  if (!fieldEntries.length) {
    lines.push("(No user fields were submitted.)");
    htmlRows.push("<tr><td colspan=\"2\" style=\"padding:14px;color:#6b7280\">No user fields were submitted.</td></tr>");
  }
  var groupedSite = claim.sourceSite;
  if (!isConfirmation) {
    groupedSite = getSiteConfiguration(spreadsheet, claim.sourceSite).submissionSite || claim.sourceSite;
  }
  var honeypotSummary = !isConfirmation ? getUnreadHoneypotSummary(spreadsheet, groupedSite) : null;
  var honeypotNote = honeypotSummary && honeypotSummary.count
    ? honeypotSummary.count + " honeypot record(s) were also received in the last 5 days. View them: " + honeypotSummary.link
    : "";
  if (honeypotNote) lines.push("", "HONEYPOT REVIEW", "===============", honeypotNote);
  var honeypotNoteHtml = honeypotSummary && honeypotSummary.count
    ? "<div style=\"margin-top:20px;padding:14px;border:1px solid #fcd34d;border-radius:8px;background:#fffbeb;color:#78350f\"><strong>" + honeypotSummary.count + " honeypot record(s) were also received in the last 5 days.</strong> <a href=\"" + htmlEscape(honeypotSummary.link) + "\" style=\"color:#92400e;text-decoration:underline\">View them in the honeypot sheet</a>.</div>"
    : "";
  var body = truncate(lines.join("\n"), DEFAULTS.EMAIL_BODY_LIMIT);
  var htmlBody = "<!doctype html><html><body style=\"margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827\">" +
    "<div style=\"max-width:720px;margin:0 auto;padding:24px 14px\">" +
    "<header style=\"background:#1f2937;color:#ffffff;border-radius:10px 10px 0 0;padding:24px\">" +
    "<div style=\"font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#d1d5db\">" + messageLabel + "</div>" +
    "<h1 style=\"font-size:25px;line-height:1.25;margin:8px 0 0;word-break:break-word;color:#ffffff\">" + messageTitle + "</h1>" +
    "<h2 style=\"font-size:18px;font-weight:400;margin:8px 0 0;word-break:break-word;color:#e5e7eb\">" + styledSiteLink + "</h2>" +
    "</header>" +
    "<div style=\"background:#ffffff;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 10px 10px;padding:24px\">" +
    "<table role=\"presentation\" style=\"width:100%;border-collapse:collapse;margin-bottom:24px\"><tr><td style=\"padding:5px 0;color:#6b7280;width:145px\">Website</td><td style=\"padding:5px 0;word-break:break-word\">" + htmlEscape(claim.sourceSite) + "</td></tr>" +
    "<tr><td style=\"padding:5px 0;color:#6b7280\">Submission ID</td><td style=\"padding:5px 0;word-break:break-word\">" + htmlEscape(claim.submissionId) + "</td></tr>" +
    "<tr><td style=\"padding:5px 0;color:#6b7280\">Received (IST)</td><td style=\"padding:5px 0\">" + htmlEscape(timestamp) + "</td></tr>" +
    "<tr><td style=\"padding:5px 0;color:#6b7280\">Fields received</td><td style=\"padding:5px 0\">" + fieldEntries.length + "</td></tr></table>" +
    "<div style=\"font-size:17px;font-weight:700;margin:0 0 10px\">Submitted data</div>" +
    "<table style=\"width:100%;border-collapse:collapse;border:1px solid #e5e7eb\"><thead><tr style=\"background:#f9fafb\"><th style=\"text-align:left;padding:10px;color:#374151;width:30%\">Field</th><th style=\"text-align:left;padding:10px;color:#374151\">Value</th></tr></thead><tbody>" +
    htmlRows.join("") +
    "</tbody></table>" +
    "<div style=\"font-size:12px;color:#6b7280;margin-top:20px\">" + (isConfirmation
      ? "Your submission was saved by FormHarbour. Keep this email for your records."
      : "Delivered by FormHarbour. The website name shown above is the submitted hostname routing hint.") + "</div>" + honeypotNoteHtml +
    "</div></div></body></html>";
  return {
    subject: (isConfirmation ? "Submission saved | " : "New Form Submission | ") + truncate(claim.sourceSite, 120),
    body: body,
    htmlBody: truncate(htmlBody, DEFAULTS.EMAIL_BODY_LIMIT)
  };
}

var valueForHeader = function(headers, values, header) {
  var wanted = schemaHeaderKey(header);
  for (var i = 0; i < headers.length; i++) {
    if (schemaHeaderKey(headers[i]) === wanted) return String(values[i] || "");
  }
  return "";
}

var htmlEscape = function(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Loads and prunes rolling quota events plus abandoned reservation leases. */
var quotaState = function() {
  var properties = PropertiesService.getScriptProperties();
  var raw = properties.getProperty(PROP.QUOTA_STATE);
  var state = { baseline: null, reservations: [], events: [] };
  if (raw) {
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) state = parsed;
    } catch (error) {
      // Rebuild a safe empty state if an administrator or partial write left
      // the internal quota property unreadable.
    }
  }
  state.reservations = (state.reservations || []).filter(function (entry) {
    return new Date().getTime() - Number(entry.at || 0) < DEFAULTS.QUOTA_RESERVATION_MS;
  });
  state.events = (state.events || []).filter(function (entry) {
    return new Date().getTime() - Number(entry[0] || 0) < 24 * 60 * 60 * 1000;
  }).slice(-DEFAULTS.MAX_QUOTA_EVENTS);
  return state;
}

/**
 * Returns the number of recipient sends that fit under the observed quota and
 * reserve. Other scripts may consume the account quota, so this is conservative
 * rather than a claim of account-wide reservation.
 */
var getQuotaBudget = function(requested) {
  var remaining;
  try {
    remaining = Number(MailApp.getRemainingDailyQuota());
  } catch (error) {
    return 0;
  }
  var state = quotaState();
  if (state.baseline === null || typeof state.baseline === "undefined") state.baseline = remaining;
  var reservePercent = Number(CONFIG.EMAIL_QUOTA_RESERVE_PERCENT);
  if (!isFinite(reservePercent) || reservePercent < 0 || reservePercent > 90) reservePercent = 10;
  var reserve = Math.max(1, Math.ceil(Number(state.baseline) * reservePercent / 100));
  var used = state.events.reduce(function (sum, entry) { return sum + Number(entry[1] || 0); }, 0);
  var inFlight = state.reservations.length;
  var applicationRemaining = Math.min(
    Number(state.baseline) - reserve - used - inFlight,
    remaining - reserve - inFlight
  );
  PropertiesService.getScriptProperties().setProperty(PROP.QUOTA_STATE, JSON.stringify(state));
  return Math.max(0, Math.floor(applicationRemaining));
}

var reserveQuota = function(token, at) {
  var state = quotaState();
  state.reservations.push({ token: token, at: at });
  PropertiesService.getScriptProperties().setProperty(PROP.QUOTA_STATE, JSON.stringify(state));
}

var releaseQuota = function(token, attempted) {
  var state = quotaState();
  state.reservations = state.reservations.filter(function (entry) { return entry.token !== token; });
  if (attempted) state.events.push([new Date().getTime(), 1]);
  state.events = state.events.slice(-DEFAULTS.MAX_QUOTA_EVENTS);
  PropertiesService.getScriptProperties().setProperty(PROP.QUOTA_STATE, JSON.stringify(state));
}

var markQueueRowFailed = function(queue, rowNumber, row, reason) {
  row[7] = "failed";
  row[10] = "";
  row[11] = reason;
  row[13] = formatIst(new Date());
  queue.getRange(rowNumber, 1, 1, QUEUE_HEADERS.length).setValues([row]);
}

var queueRowIsHoneypotDigest = function(row, states) {
  return String(row[2] || "").indexOf(HONEYPOT_SHEET_PREFIX) === 0 || states.some(function(state) {
    return state.kind === "honeypot_digest";
  });
}

var finalizeHoneypotDigestStatuses = function(spreadsheet, sheetName, windowId, queueStatus) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return;
  var records = readHoneypotRecords(sheet).filter(function(record) { return record.windowId === windowId; });
  var status = queueStatus === "sent" ? HONEYPOT_MAIL_MAILED : HONEYPOT_MAIL_FAILED;
  var rowNumbers = records.filter(function(record) {
    if (String(record.readStatus).toLowerCase() === String(HONEYPOT_READ_READ).toLowerCase()) return false;
    return record.mailedStatus === HONEYPOT_MAIL_QUEUED;
  }).map(function(record) { return record.rowNumber; });
  setHoneypotMailStatus(sheet, rowNumbers, status);
  var readRows = records.filter(function(record) {
    return String(record.readStatus).toLowerCase() === String(HONEYPOT_READ_READ).toLowerCase() &&
      record.mailedStatus === HONEYPOT_MAIL_QUEUED;
  }).map(function(record) { return record.rowNumber; });
  setHoneypotMailStatus(sheet, readRows, HONEYPOT_MAIL_NOT_REQUIRED);
}

var finalizeTerminalQueueRow = function(spreadsheet, queue, rowNumber, row, states) {
  row[7] = aggregateQueueStatus(states);
  row[12] = JSON.stringify(states);
  row[13] = formatIst(new Date());
  queue.getRange(rowNumber, 1, 1, QUEUE_HEADERS.length).setValues([row]);
  setPendingCount(getPendingCount() - 1);
  if (queueRowIsHoneypotDigest(row, states)) {
    finalizeHoneypotDigestStatuses(spreadsheet, String(row[2]), String(row[4]), row[7]);
  } else {
    updateSiteNotificationStatusByLocation(spreadsheet, String(row[2]), Number(row[3]), row[7]);
  }
}

var updateSiteNotificationStatusByLocation = function(spreadsheet, sheetName, rowNumber, status) {
  try {
    var sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet || rowNumber < 2 || rowNumber > sheet.getLastRow()) return;
    var lastColumn = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    for (var i = 0; i < headers.length; i++) {
      if (canonicalHeader(headers[i]) === canonicalHeader(METADATA_HEADERS[3])) {
        sheet.getRange(rowNumber, i + 1).setValue(cellValue(status));
        return;
      }
    }
  } catch (error) {
    safeLog("status_update_failure", normalizeError(error).code);
  }
}

/** Returns the stable sheet ID used to remember a tab's expected structure. */
var sheetStructureId = function(sheet) {
  return String(sheet.getSheetId());
};

/** Stores the expected name and exact header row for a website tab. */
var rememberSheetStructure = function(sheet, headers, kind) {
  var properties = PropertiesService.getScriptProperties();
  var structures = {};
  try { structures = JSON.parse(properties.getProperty(PROP.SHEET_STRUCTURE) || "{}"); } catch (error) { structures = {}; }
  structures[sheetStructureId(sheet)] = {
    name: sheet.getName(),
    headers: headers.slice(),
    kind: kind || "site"
  };
  properties.setProperty(PROP.SHEET_STRUCTURE, JSON.stringify(structures));
};

/**
 * Restores a protected website tab after a rename or header edit. The stable
 * sheet ID lets this find the original tab even after its visible name changes.
 */
var restoreRememberedSheetStructures = function(spreadsheet) {
  var properties = PropertiesService.getScriptProperties();
  var structures;
  try { structures = JSON.parse(properties.getProperty(PROP.SHEET_STRUCTURE) || "{}"); } catch (error) { structures = {}; }
  var sheetsById = {};
  spreadsheet.getSheets().forEach(function(sheet) { sheetsById[sheetStructureId(sheet)] = sheet; });
  var remaining = {};

  Object.keys(structures).forEach(function(id) {
    var expected = structures[id];
    var sheet = sheetsById[id];
    if (!sheet || !expected || !Array.isArray(expected.headers)) return;
    remaining[id] = expected;

    if (sheet.getName() !== expected.name && !spreadsheet.getSheetByName(expected.name)) {
      sheet.setName(expected.name);
    }

    var expectedHeaders = expected.headers;
    var currentColumnCount = sheet.getLastColumn();
    if (sheet.getMaxColumns() < expectedHeaders.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), expectedHeaders.length - sheet.getMaxColumns());
    }
    var currentHeaders = currentColumnCount
      ? sheet.getRange(1, 1, 1, currentColumnCount).getValues()[0]
      : [];
    var headersChanged = currentHeaders.length !== expectedHeaders.length || currentHeaders.some(function(header, index) {
      return String(header || "") !== String(expectedHeaders[index] || "");
    });
    if (headersChanged) {
      if (currentColumnCount > expectedHeaders.length) {
        sheet.getRange(1, expectedHeaders.length + 1, 1, currentColumnCount - expectedHeaders.length).clearContent();
      }
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    }
    if (expected.kind === "honeypot") {
      var migratedHoneypotSchema = ensureHoneypotHeaders(sheet, []);
      normalizeLegacyHoneypotRows(sheet, migratedHoneypotSchema);
      expectedHeaders = migratedHoneypotSchema.headers;
      remaining[id].headers = expectedHeaders;
      protectHoneypotStructure(sheet, expectedHeaders);
    } else if (expected.kind === "config") {
      protectHeaderRow(sheet, SITE_CONFIG_HEADERS);
      remaining[id].headers = SITE_CONFIG_HEADERS.slice();
      rememberSheetStructure(sheet, SITE_CONFIG_HEADERS, "config");
    } else if (expected.kind === "system") {
      sheet.hideSheet();
      protectHeaderRow(sheet, expectedHeaders, SYSTEM_HEADER_PROTECTION_DESCRIPTION);
      protectSystemSheet(sheet);
      remaining[id].headers = expectedHeaders.slice();
      rememberSheetStructure(sheet, expectedHeaders, "system");
    } else {
      protectSiteStructure(sheet, expectedHeaders);
    }
  });

  properties.setProperty(PROP.SHEET_STRUCTURE, JSON.stringify(remaining));
};

/** Handler for the installable spreadsheet change trigger. */
var handleSpreadsheetChange = function(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.LOCK_WAIT_MS)) return;
  try {
    var spreadsheet = openConfiguredSpreadsheet();
    restoreRememberedSheetStructures(spreadsheet);
    ensureSystemSheets(spreadsheet);
    ensureSiteConfigRowsForWebsiteSheets(spreadsheet);
    invalidateAllSiteConfigurationCache();
  } catch (error) {
    safeLog("sheet_structure_restore_failure", normalizeError(error).code);
  } finally {
    lock.releaseLock();
  }
};

/** Invalidates routing caches immediately after a user edits site config. */
var handleSpreadsheetEdit = function(e) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.LOCK_WAIT_MS)) return;
  try {
    if (!e || !e.range || !e.range.getSheet) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== SITE_CONFIG_SHEET_NAME) return;
    // This also fills submission_sheet for a manually added site row. Existing
    // nonblank grouping choices are never overwritten.
    ensureSiteConfigSubmissionSheetValues(sheet);
    invalidateAllSiteConfigurationCache();
  } catch (error) {
    safeLog("site_config_cache_invalidation_failure", normalizeError(error).code);
  } finally {
    lock.releaseLock();
  }
};

/** Resizes managed system columns during the two daily maintenance windows. */
var handleHeaderResize = function() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.ADMIN_LOCK_WAIT_MS)) return;
  try {
    var spreadsheet = openConfiguredSpreadsheet();
    restoreRememberedSheetNames(spreadsheet);
    ensureRuntimeSystemSheets(spreadsheet);
    resizeAllManagedSystemColumns(spreadsheet);
    SpreadsheetApp.flush();
    safeLog("header_resize", "managed system columns resized");
  } catch (error) {
    safeLog("header_resize_failure", normalizeError(error).code);
  } finally {
    lock.releaseLock();
  }
};

/** Secures metadata and header rows on site tabs that existed before this protection was added. */
var protectExistingSiteSheets = function(spreadsheet) {
  spreadsheet.getSheets().forEach(function(sheet) {
    if (Object.keys(SYSTEM_SHEETS).some(function(key) {
      return SYSTEM_SHEETS[key] === sheet.getName();
    }) || sheet.getName() === SITE_CONFIG_SHEET_NAME) return;
    var lastColumn = sheet.getLastColumn();
    if (!lastColumn) return;
    var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    // Honeypot tabs do not have the three normal submission metadata columns,
    // so identify them by their reserved tab-name prefix and add the review
    // columns before applying their protections.
    if (sheet.getName().indexOf(HONEYPOT_SHEET_PREFIX) === 0) {
      var honeypotSchema = ensureHoneypotHeaders(sheet, []);
      normalizeLegacyHoneypotRows(sheet, honeypotSchema);
      protectHoneypotStructure(sheet, honeypotSchema.headers);
      return;
    }
    var hasReservedMetadata = PROTECTED_METADATA_HEADERS.some(function(header) {
      var wanted = schemaHeaderKey(header);
      return headers.some(function(currentHeader) {
        return schemaHeaderKey(currentHeader) === wanted;
      });
    });
    if (hasReservedMetadata) protectSiteStructure(sheet, headers);
  });
};

/** Installs one change trigger that restores protected tab names and headers. */
var ensureStructureTrigger = function(spreadsheet) {
  var triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === "handleSpreadsheetChange";
  });
  for (var i = 1; i < triggers.length; i++) ScriptApp.deleteTrigger(triggers[i]);
  if (!triggers.length) {
    ScriptApp.newTrigger("handleSpreadsheetChange").forSpreadsheet(spreadsheet).onChange().create();
  }

  var editTriggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === "handleSpreadsheetEdit";
  });
  for (var j = 1; j < editTriggers.length; j++) ScriptApp.deleteTrigger(editTriggers[j]);
  if (!editTriggers.length) {
    ScriptApp.newTrigger("handleSpreadsheetEdit").forSpreadsheet(spreadsheet).onEdit().create();
  }
};

/** Creates exactly two daily traffic-time column-resize triggers. */
var ensureHeaderResizeTriggers = function() {
  var existing = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === "handleHeaderResize";
  });
  existing.forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });

  var configuredHours = Array.isArray(CONFIG.HEADER_RESIZE_TRIGGER_HOURS)
    ? CONFIG.HEADER_RESIZE_TRIGGER_HOURS
    : [9, 18];
  var hours = configuredHours.map(Number).filter(function(hour) {
    return isFinite(hour) && hour >= 0 && hour <= 23;
  }).map(function(hour) {
    return Math.floor(hour);
  }).filter(function(hour, index, values) {
    return values.indexOf(hour) === index;
  });
  if (hours.length !== 2) hours = [9, 18];
  hours.forEach(function(hour) {
    ScriptApp.newTrigger("handleHeaderResize").timeBased().atHour(hour).everyDays(1).create();
  });
  return hours.length;
};

// Administrator entry points and bounded maintenance operations.
/**
 * Initializes hidden system tabs, validates the configured services, and
 * creates one notification trigger, one structure trigger, one config-edit
 * trigger, and two daily header-resize triggers.
 * Repeated runs are safe.
 */
function setup() {
  var diagnostics = { ok: false, errors: [], warnings: [], invalidRecipients: [] };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.ADMIN_LOCK_WAIT_MS)) {
    diagnostics.errors.push("The system is busy. Run setup() again shortly.");
    Logger.log(JSON.stringify(diagnostics));
    return diagnostics;
  }
  try {
    var spreadsheet = openConfiguredSpreadsheet();
    restoreRememberedSheetStructures(spreadsheet);
    ensureSystemSheets(spreadsheet);
    ensureSiteConfigRowsForWebsiteSheets(spreadsheet);
    var siteConfig = inspectSiteConfig(spreadsheet);
    diagnostics.configuredSiteCount = siteConfig.configuredSiteCount;
    diagnostics.disabledSiteCount = siteConfig.disabledSiteCount;
    diagnostics.invalidSiteConfigRows = siteConfig.invalidRows;
    if (siteConfig.invalidRows.length) diagnostics.warnings.push("Some site configuration rows have invalid sites or recipients.");
    if (siteConfig.duplicateSites.length) diagnostics.warnings.push("Duplicate site configuration rows exist for: " + siteConfig.duplicateSites.join(", "));
    protectExistingSiteSheets(spreadsheet);
    resizeAllManagedSystemColumns(spreadsheet);
    ensureStructureTrigger(spreadsheet);
    recalculatePendingCount(spreadsheet);
    try { spreadsheet.setSpreadsheetTimeZone(CONFIG.TIMEZONE); } catch (timezoneError) {
      diagnostics.warnings.push("Spreadsheet timezone could not be changed automatically.");
    }
    var recipients = normalizeRecipients(CONFIG.NOTIFICATION_EMAILS);
    diagnostics.invalidRecipients = recipients.invalid;
    if (recipients.invalid.length) {
      diagnostics.warnings.push("Invalid notification recipients were excluded.");
      safeLog("invalid_recipient_configuration", "count=" + recipients.invalid.length);
    }
    if (!recipients.valid.length) diagnostics.warnings.push("No valid notification recipient is configured.");
    var reservePercent = Number(CONFIG.EMAIL_QUOTA_RESERVE_PERCENT);
    if (!isFinite(reservePercent) || reservePercent < 0 || reservePercent > 90) {
      diagnostics.warnings.push("EMAIL_QUOTA_RESERVE_PERCENT is invalid; the worker will use 10%.");
    }
    var quota;
    try { quota = MailApp.getRemainingDailyQuota(); } catch (quotaError) {
      diagnostics.errors.push("MailApp authorization is required.");
    }
    var triggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === "processPendingNotifications";
    });
    triggers.forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
    PropertiesService.getScriptProperties().deleteProperty(PROP.RECOVERY_TRIGGER_AT);
    PropertiesService.getScriptProperties().deleteProperty(PROP.RECOVERY_TRIGGER_ID);
    ScriptApp.newTrigger("processPendingNotifications").timeBased()
      .everyMinutes(DEFAULTS.NOTIFICATION_TRIGGER_MINUTES).create();
    diagnostics.headerResizeTriggerCount = ensureHeaderResizeTriggers();
    diagnostics.triggerCount = 1;
    diagnostics.structureTriggerCount = 1;
    diagnostics.editTriggerCount = 1;
    diagnostics.spreadsheetName = spreadsheet.getName();
    diagnostics.remainingEmailRecipientQuota = quota === undefined ? null : quota;
    diagnostics.pendingNotifications = getPendingCount();
    diagnostics.timezone = CONFIG.TIMEZONE;
    diagnostics.confirmationEmailsEnabled = CONFIG.SEND_CONFIRMATION_EMAILS === true;
    diagnostics.ok = diagnostics.errors.length === 0;
    safeLog("setup", diagnostics.ok ? "success" : "errors=" + diagnostics.errors.length);
  } catch (error) {
    var safeError = normalizeError(error);
    diagnostics.errors.push(safeError.publicMessage);
    safeLog("setup_failure", safeError.code);
  } finally {
    lock.releaseLock();
  }
  Logger.log(JSON.stringify(diagnostics));
  return diagnostics;
}

/** Runs validation-only checks without writing a production row or sending mail. */
function testSubmission() {
  var result = { ok: false, writes: false, emailsSent: false };
  try {
    var event = {
      postData: { type: "application/json", contents: JSON.stringify({
        _site: "test.example",
        _submission_id: "test-" + Utilities.getUuid(),
        name: "FormHarbour setup test",
        message: "This is a dry-run; no sheet row or email is created."
      }) }
    };
    var parsed = parseRequest(event);
    var site = normalizeSite(parsed.fields._site);
    var fields = normalizeFields(parsed.fields);
    var recipients = normalizeRecipients(CONFIG.NOTIFICATION_EMAILS);
    result.ok = true;
    result.site = site;
    result.fieldCount = Object.keys(fields).length;
    result.validRecipientCount = recipients.valid.length;
    result.invalidRecipientCount = recipients.invalid.length;
    result.message = "Validation dry-run passed. No production data or email was created.";
  } catch (error) {
    var safeError = normalizeError(error);
    result.error = safeError.publicMessage;
  }
  Logger.log(JSON.stringify(result));
  return result;
}

/** Returns concise administrator diagnostics without exposing form contents. */
function checkSystemHealth() {
  var health = { ok: false, errors: [], warnings: [] };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.ADMIN_LOCK_WAIT_MS)) {
    health.errors.push("The system is busy. Run checkSystemHealth() again shortly.");
    Logger.log(JSON.stringify(health));
    return health;
  }
  try {
    var spreadsheet = openConfiguredSpreadsheet();
    restoreRememberedSheetStructures(spreadsheet);
    ensureSystemSheets(spreadsheet);
    var siteConfig = inspectSiteConfig(spreadsheet);
    recalculatePendingCount(spreadsheet);
    var recipients = normalizeRecipients(CONFIG.NOTIFICATION_EMAILS);
    var queue = spreadsheet.getSheetByName(SYSTEM_SHEETS.QUEUE);
    var lastRow = queue.getLastRow();
    var counts = { pending: 0, retry: 0, processing: 0, sent: 0, failed: 0, partial: 0 };
    if (lastRow > 1) {
      var scanStart = Math.max(2, lastRow - DEFAULTS.MAX_QUEUE_SCAN_ROWS + 1);
      var rows = queue.getRange(scanStart, 8, lastRow - scanStart + 1, 1).getValues();
      rows.forEach(function (row) {
        var status = String(row[0] || "");
        if (counts[status] !== undefined) counts[status]++;
        else if (status.indexOf("partial") === 0) counts.partial++;
      });
    }
    var notificationTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === "processPendingNotifications";
    });
    var recoveryTriggerId = PropertiesService.getScriptProperties().getProperty(PROP.RECOVERY_TRIGGER_ID);
    var recoveryTriggers = notificationTriggers.filter(function(trigger) {
      return recoveryTriggerId && typeof trigger.getUniqueId === "function" &&
        String(trigger.getUniqueId()) === String(recoveryTriggerId);
    });
    var triggers = notificationTriggers.filter(function(trigger) {
      return recoveryTriggers.indexOf(trigger) < 0;
    });
    var structureTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === "handleSpreadsheetChange";
    });
    var editTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === "handleSpreadsheetEdit";
    });
    var headerResizeTriggers = ScriptApp.getProjectTriggers().filter(function (trigger) {
      return trigger.getHandlerFunction() === "handleHeaderResize";
    });
    var remaining = null;
    try { remaining = MailApp.getRemainingDailyQuota(); } catch (quotaError) {
      health.errors.push("MailApp authorization is unavailable.");
    }
    if (!recipients.valid.length) health.warnings.push("No valid recipients are configured.");
    if (triggers.length !== 1) health.warnings.push("Notification trigger count is " + triggers.length + ". Run setup().");
    if (structureTriggers.length !== 1) health.warnings.push("Spreadsheet-change trigger count is " + structureTriggers.length + ". Run setup().");
    if (editTriggers.length !== 1) health.warnings.push("Spreadsheet-edit trigger count is " + editTriggers.length + ". Run setup().");
    if (headerResizeTriggers.length !== 2) health.warnings.push("Header-resize trigger count is " + headerResizeTriggers.length + ". Run setup().");
    if (getPendingCount() > DEFAULTS.MAX_PENDING_NOTIFICATIONS) health.warnings.push("Pending count exceeds the configured limit.");
    health.spreadsheet = spreadsheet.getName();
    health.pendingNotifications = getPendingCount();
    health.queueStatusCounts = counts;
    health.validRecipientCount = recipients.valid.length;
    health.invalidRecipientCount = recipients.invalid.length;
    health.configuredSiteCount = siteConfig.configuredSiteCount;
    health.disabledSiteCount = siteConfig.disabledSiteCount;
    health.invalidSiteConfigRows = siteConfig.invalidRows;
    health.duplicateSiteConfigSites = siteConfig.duplicateSites;
    if (siteConfig.invalidRows.length) health.warnings.push("Some site configuration rows have invalid sites or recipients.");
    if (siteConfig.duplicateSites.length) health.warnings.push("Duplicate site configuration rows exist.");
    health.remainingEmailRecipientQuota = remaining;
    health.triggerCount = triggers.length;
    health.recoveryTriggerCount = recoveryTriggers.length;
    health.structureTriggerCount = structureTriggers.length;
    health.editTriggerCount = editTriggers.length;
    health.headerResizeTriggerCount = headerResizeTriggers.length;
    health.confirmationEmailsEnabled = CONFIG.SEND_CONFIRMATION_EMAILS === true;
    health.recentErrors = recentErrors(spreadsheet);
    health.ok = health.errors.length === 0;
  } catch (error) {
    var safeError = normalizeError(error);
    health.errors.push(safeError.publicMessage);
  } finally {
    lock.releaseLock();
  }
  Logger.log(JSON.stringify(health));
  return health;
}

// Lightweight diagnostics and generic helpers intentionally avoid raw request
// bodies, stack traces, and unnecessary personal data in logs or responses.
var recentErrors = function(spreadsheet) {
  var sheet = spreadsheet.getSheetByName(SYSTEM_SHEETS.LOG);
  if (!sheet || sheet.getLastRow() < 2) return [];
  var count = Math.min(10, sheet.getLastRow() - 1);
  var values = sheet.getRange(sheet.getLastRow() - count + 1, 1, count, 3).getDisplayValues();
  return values.reverse().filter(function (row) {
    return /failure|error|rejected|quota|retry|invalid/i.test(row[1]);
  }).map(function (row) {
    return { timestamp: row[0], event: row[1], detail: row[2] };
  });
}

var recalculatePendingCount = function(spreadsheet) {
  var queue = spreadsheet.getSheetByName(SYSTEM_SHEETS.QUEUE);
  if (!queue || queue.getLastRow() < 2) {
    setPendingCount(0);
    return 0;
  }
  var statuses = queue.getRange(2, 8, queue.getLastRow() - 1, 1).getValues();
  var count = statuses.filter(function (row) {
    return ["pending", "retry", "processing", "partial_retry"].indexOf(String(row[0] || "")) >= 0;
  }).length;
  setPendingCount(count);
  return count;
}

var cleanupQueueHistory = function() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(DEFAULTS.LOCK_WAIT_MS)) return;
  try {
    var properties = PropertiesService.getScriptProperties();
    var now = new Date().getTime();
    var lastCleanup = Number(properties.getProperty("__FH_LAST_QUEUE_CLEANUP") || 0);
    if (now - lastCleanup < 24 * 60 * 60 * 1000) return;
    var spreadsheet = openConfiguredSpreadsheet();
    ensureRuntimeSystemSheets(spreadsheet);
    var queue = spreadsheet.getSheetByName(SYSTEM_SHEETS.QUEUE);
    if (!queue || queue.getLastRow() < 2) {
      properties.setProperty("__FH_LAST_QUEUE_CLEANUP", String(now));
      return;
    }
    var lastRow = queue.getLastRow();
    var rows = queue.getRange(2, 1, lastRow - 1, QUEUE_HEADERS.length).getValues();
    var deletions = [];
    rows.forEach(function (row, index) {
      if (["sent", "failed", "partial_failed"].indexOf(String(row[7] || "")) < 0) return;
      var created = row[6] instanceof Date ? row[6].getTime() : Date.parse(String(row[6] || ""));
      if (isFinite(created) && now - created > DEFAULTS.QUEUE_RETENTION_MS) deletions.push(index + 2);
    });
    deletions.slice(-100).reverse().forEach(function (rowNumber) { queue.deleteRow(rowNumber); });
    properties.setProperty("__FH_LAST_QUEUE_CLEANUP", String(now));
    properties.setProperty(PROP.QUEUE_CURSOR, "2");
  } catch (error) {
    safeLog("queue_cleanup_failure", normalizeError(error).code);
  } finally {
    lock.releaseLock();
  }
}

var maybeCleanupIdempotency = function() {
  var properties = PropertiesService.getScriptProperties();
  var now = new Date().getTime();
  var last = Number(properties.getProperty(PROP.LAST_IDEM_CLEANUP) || 0);
  if (now - last < 24 * 60 * 60 * 1000) return;
  var all = properties.getProperties();
  var records = [];
  Object.keys(all).forEach(function (key) {
    if (key.indexOf(PROP.IDEM_PREFIX) !== 0) return;
    try {
      var record = JSON.parse(all[key]);
      if (now - Number(record.createdAt || 0) > DEFAULTS.IDEMPOTENCY_RETENTION_MS) {
        properties.deleteProperty(key);
      } else {
        records.push({ key: key, createdAt: Number(record.createdAt || 0) });
      }
    } catch (error) {
      properties.deleteProperty(key);
    }
  });
  if (records.length > DEFAULTS.MAX_IDEMPOTENCY_RECORDS) {
    records.sort(function (left, right) { return left.createdAt - right.createdAt; });
    records.slice(0, records.length - DEFAULTS.MAX_IDEMPOTENCY_RECORDS).forEach(function (record) {
      properties.deleteProperty(record.key);
    });
  }
  properties.setProperty(PROP.LAST_IDEM_CLEANUP, String(now));
}

var readNumberArrayProperty = function(key) {
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter(isFinite) : [];
  } catch (error) {
    return [];
  }
}

var safeLog = function(event, detail) {
  try {
    var spreadsheet = openConfiguredSpreadsheet();
    var sheet = spreadsheet.getSheetByName(SYSTEM_SHEETS.LOG) || ensureSystemSheet(spreadsheet, SYSTEM_SHEETS.LOG, LOG_HEADERS);
    sheet.appendRow([formatIst(new Date()), String(event).substring(0, 80), truncate(String(detail || ""), 400)]);
    if (sheet.getLastRow() > DEFAULTS.LOG_RETENTION_ROWS) {
      sheet.deleteRows(2, Math.min(50, sheet.getLastRow() - DEFAULTS.LOG_RETENTION_ROWS));
    }
  } catch (ignored) {
    Logger.log(String(event) + " " + String(detail || ""));
  }
}

/** Sends rate-limited operational alerts to the configured administrators. */
var sendAdminAlert = function(code, detail) {
  try {
    var recipients = normalizeRecipients(CONFIG.ADMIN_ALERT_EMAILS || []).valid;
    if (!recipients.length) return;
    var alertKey = PROP.ALERT_PREFIX + sha256(String(code)).substring(0, 24);
    var properties = PropertiesService.getScriptProperties();
    var now = new Date().getTime();
    var lastSent = Number(properties.getProperty(alertKey) || 0);
    if (lastSent && now - lastSent < DEFAULTS.ADMIN_ALERT_COOLDOWN_MS) return;

    var sent = false;
    recipients.forEach(function(email) {
      try {
        MailApp.sendEmail({
          to: email,
          subject: "FormHarbour alert | " + truncate(String(code), 100),
          body: [
            "FormHarbour detected an operational issue.",
            "",
            "Event: " + String(code),
            "Time (IST): " + formatIst(new Date()),
            "Detail: " + truncate(String(detail || ""), 500),
            "",
            "Run checkSystemHealth() for diagnostics."
          ].join("\n"),
          name: DEFAULTS.NOTIFICATION_SENDER_NAME
        });
        sent = true;
      } catch (mailError) {
        safeLog("admin_alert_delivery_failure", String(code));
      }
    });
    if (sent) properties.setProperty(alertKey, String(now));
  } catch (error) {
    safeLog("admin_alert_failure", String(code));
  }
}

var formatIst = function(date) {
  try {
    return Utilities.formatDate(date, CONFIG.TIMEZONE, "yyyy-MM-dd HH:mm:ss");
  } catch (error) {
    return Utilities.formatDate(date, "Asia/Kolkata", "yyyy-MM-dd HH:mm:ss");
  }
}

var jsonResponse = function(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

var truncate = function(value, maxLength) {
  var text = String(value || "");
  return text.length <= maxLength ? text : text.substring(0, maxLength) + "\n[truncated]";
}

var appError = function(code, publicMessage, retryable) {
  var error = new Error(code);
  error.appCode = code;
  error.publicMessage = publicMessage;
  error.retryable = Boolean(retryable);
  return error;
}

var normalizeError = function(error) {
  var knownError = Boolean(error && error.appCode);
  var code = knownError ? error.appCode : "unexpected_error";
  var publicMessage = knownError && error.publicMessage
    ? error.publicMessage
    : "The request could not be completed. Retry the submission.";
  return {
    code: code,
    publicMessage: publicMessage,
    retryable: knownError ? Boolean(error.retryable) : true
  };
}

var safeErrorText = function(error) {
  var text = error && error.message ? String(error.message) : String(error || "mail failure");
  return truncate(text.replace(/[\r\n]+/g, " "), 300);
}

  // Keep the implementation private. Top-level wrapper declarations below
  // provide the names Apps Script needs for its function picker and dispatch.
  Object.defineProperty(globalThis, "__FORMHARBOUR_API", {
    value: {
      doPost: doPost,
      processPendingNotifications: processPendingNotifications,
      setup: setup,
      testSubmission: testSubmission,
      checkSystemHealth: checkSystemHealth
    },
    configurable: true
  });

  // The spreadsheet-change trigger still needs to resolve this handler by
  // name, and the local harness calls it directly. Keep it non-enumerable so
  // it does not become another visible option in the Apps Script picker.
  Object.defineProperty(globalThis, "handleSpreadsheetChange", {
    value: handleSpreadsheetChange,
    configurable: true
  });
  Object.defineProperty(globalThis, "handleSpreadsheetEdit", {
    value: handleSpreadsheetEdit,
    configurable: true
  });
  Object.defineProperty(globalThis, "handleHeaderResize", {
    value: handleHeaderResize,
    configurable: true
  });
}());

// Apps Script's editor lists classic top-level declarations, but not private
// closure methods. Keep these wrappers intentionally small and stable so the
// picker exposes only the supported manual entry points.
function doPost(e) {
  return globalThis.__FORMHARBOUR_API.doPost(e);
}

function processPendingNotifications(maxItems) {
  return globalThis.__FORMHARBOUR_API.processPendingNotifications(maxItems);
}

function setup() {
  return globalThis.__FORMHARBOUR_API.setup();
}

function testSubmission() {
  return globalThis.__FORMHARBOUR_API.testSubmission();
}

function checkSystemHealth() {
  return globalThis.__FORMHARBOUR_API.checkSystemHealth();
}
