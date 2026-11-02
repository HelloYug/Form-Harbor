const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const CODE = fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8");

function displayValue(value) {
  if (value === null || typeof value === "undefined") return "";
  if (value instanceof Date) {
    return value.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  }
  return String(value);
}

class MockRange {
  constructor(sheet, row, column, rowCount = 1, columnCount = 1) {
    this.sheet = sheet;
    this.row = row;
    this.column = column;
    this.rowCount = rowCount;
    this.columnCount = columnCount;
  }

  getValues() {
    return this.sheet.read(this.row, this.column, this.rowCount, this.columnCount);
  }

  getDisplayValues() {
    return this.getValues().map((row) => row.map(displayValue));
  }

  setValues(values) {
    this.sheet.write(this.row, this.column, values);
    return this;
  }

  setValue(value) {
    this.sheet.write(this.row, this.column, [[value]]);
    return this;
  }

  setDataValidation(rule) {
    this.sheet.dataValidations.push({
      row: this.row,
      column: this.column,
      rowCount: this.rowCount,
      columnCount: this.columnCount,
      rule
    });
    return this;
  }

  clearContent() {
    this.sheet.clear(this.row, this.column, this.rowCount, this.columnCount);
    return this;
  }

  protect() {
    const protection = new MockProtection(this);
    this.sheet.protections.push(protection);
    return protection;
  }
}

class MockProtection {
  constructor(range) {
    this.range = range;
    this.description = "";
    this.warningOnly = true;
    this.editors = [];
    this.domainEdit = false;
  }

  getDescription() {
    return this.description;
  }

  setDescription(description) {
    this.description = description;
    return this;
  }

  setWarningOnly(value) {
    this.warningOnly = value;
    return this;
  }

  addEditor(editor) {
    this.editors.push(editor);
    return this;
  }

  getEditors() {
    return this.editors.slice();
  }

  removeEditors(editors) {
    this.editors = this.editors.filter((editor) => !editors.includes(editor));
    return this;
  }

  canDomainEdit() {
    return this.domainEdit;
  }

  setDomainEdit(value) {
    this.domainEdit = value;
    return this;
  }

  remove() {
    const protections = this.range.sheet.protections;
    const index = protections.indexOf(this);
    if (index >= 0) protections.splice(index, 1);
  }
}

class MockSheet {
  constructor(name, rows = [], id = 1, owner = null) {
    this.name = name;
    this.id = id;
    this.owner = owner;
    this.grid = rows.map((row) => row.slice());
    this.hidden = false;
    this.protections = [];
    this.dataValidations = [];
  }

  getName() {
    return this.name;
  }

  getSheetId() {
    return this.id;
  }

  setName(name) {
    if (this.owner && this.owner.sheets.has(name)) throw new Error("Sheet already exists: " + name);
    if (this.owner) {
      this.owner.sheets.delete(this.name);
      this.owner.sheets.set(name, this);
    }
    this.name = name;
    return this;
  }

  getLastRow() {
    for (let index = this.grid.length - 1; index >= 0; index -= 1) {
      if (this.grid[index].some((value) => value !== "" && value !== null && typeof value !== "undefined")) {
        return index + 1;
      }
    }
    return 0;
  }

  getLastColumn() {
    const lastRow = this.getLastRow();
    if (!lastRow) return 0;
    return this.grid.slice(0, lastRow).reduce((width, row) => Math.max(width, row.length), 0);
  }

  getMaxRows() {
    return Math.max(1000, this.grid.length);
  }

  getMaxColumns() {
    return Math.max(26, this.grid.reduce((width, row) => Math.max(width, row.length), 0));
  }

  ensureSize(rowCount, columnCount) {
    while (this.grid.length < rowCount) this.grid.push([]);
    for (const row of this.grid) {
      while (row.length < columnCount) row.push("");
    }
  }

  read(row, column, rowCount, columnCount) {
    this.ensureSize(row - 1 + rowCount, column - 1 + columnCount);
    return this.grid
      .slice(row - 1, row - 1 + rowCount)
      .map((sourceRow) => sourceRow.slice(column - 1, column - 1 + columnCount));
  }

  write(row, column, values) {
    const width = values.reduce((max, current) => Math.max(max, current.length), 0);
    this.ensureSize(row - 1 + values.length, column - 1 + width);
    values.forEach((sourceRow, rowOffset) => {
      sourceRow.forEach((value, columnOffset) => {
        this.grid[row - 1 + rowOffset][column - 1 + columnOffset] = value;
      });
    });
  }

  clear(row, column, rowCount, columnCount) {
    this.ensureSize(row - 1 + rowCount, column - 1 + columnCount);
    for (let rowOffset = 0; rowOffset < rowCount; rowOffset += 1) {
      for (let columnOffset = 0; columnOffset < columnCount; columnOffset += 1) {
        this.grid[row - 1 + rowOffset][column - 1 + columnOffset] = "";
      }
    }
  }

  getRange(row, column, rowCount = 1, columnCount = 1) {
    if (typeof row === "string") {
      const match = /^([A-Z]+):\1$/.exec(row);
      if (!match) throw new Error("Unsupported A1 range: " + row);
      const columnLabel = match[1];
      let columnNumber = 0;
      for (const character of columnLabel) {
        columnNumber = columnNumber * 26 + character.charCodeAt(0) - 64;
      }
      return new MockRange(this, 1, columnNumber, Math.max(1000, this.getLastRow()), 1);
    }
    return new MockRange(this, row, column, rowCount, columnCount);
  }

  getProtections() {
    return this.protections.slice();
  }

  appendRow(values) {
    this.grid.push(values.slice());
    return this;
  }

  insertColumnsAfter(column, count) {
    this.grid.forEach((row) => {
      while (row.length < column) row.push("");
      row.splice(column, 0, ...new Array(count).fill(""));
    });
  }

  deleteRows(startRow, count) {
    this.grid.splice(startRow - 1, count);
  }

  deleteRow(row) {
    this.deleteRows(row, 1);
  }

  hideSheet() {
    this.hidden = true;
  }

  isSheetHidden() {
    return this.hidden;
  }
}

class MockSpreadsheet {
  constructor(id) {
    this.id = id;
    this.name = "FormHarbour Test Spreadsheet";
    this.timezone = "UTC";
    this.nextSheetId = 2;
    this.sheets = new Map();
    this.sheets.set("Sheet1", new MockSheet("Sheet1", [], 1, this));
    this.activeSheet = this.sheets.get("Sheet1");
  }

  getName() {
    return this.name;
  }

  setSpreadsheetTimeZone(timezone) {
    this.timezone = timezone;
  }

  getSheetByName(name) {
    return this.sheets.get(name) || null;
  }

  getSheets() {
    return Array.from(this.sheets.values());
  }

  insertSheet(name) {
    if (this.sheets.has(name)) throw new Error("Sheet already exists: " + name);
    const sheet = new MockSheet(name, [], this.nextSheetId++, this);
    this.sheets.set(name, sheet);
    return sheet;
  }

  setActiveSheet(sheet) {
    this.activeSheet = sheet;
    return sheet;
  }

  moveActiveSheet(position) {
    const sheets = Array.from(this.sheets.values()).filter((sheet) => sheet !== this.activeSheet);
    const index = Math.max(0, Math.min(sheets.length, Number(position) - 1));
    sheets.splice(index, 0, this.activeSheet);
    this.sheets = new Map(sheets.map((sheet) => [sheet.getName(), sheet]));
  }
}

function makeHarness({
  recipients = ["admin@example.com", "owner@example.com"],
  remainingQuota = 100,
  failingRecipients = [],
  confirmationEmails = false
} = {}) {
  const spreadsheet = new MockSpreadsheet("test-spreadsheet");
  const properties = new Map();
  const cache = new Map();
  const triggers = [];
  const sentMail = [];
  const uuidState = { count: 0 };
  const mail = {
    remainingQuota,
    sentMail,
    failingRecipients: new Set(failingRecipients),
    getRemainingDailyQuota() {
      return this.remainingQuota;
    },
    sendEmail(options) {
      if (this.failingRecipients.has(options.to)) {
        throw new Error("temporary delivery failure for " + options.to);
      }
      if (this.remainingQuota <= 0) throw new Error("Service invoked too many times for one day");
      this.remainingQuota -= 1;
      sentMail.push(options);
    }
  };

  const propertyStore = {
    getProperty(key) {
      return properties.has(key) ? properties.get(key) : null;
    },
    setProperty(key, value) {
      properties.set(key, String(value));
    },
    deleteProperty(key) {
      properties.delete(key);
    },
    getProperties() {
      return Object.fromEntries(properties.entries());
    }
  };

  const context = {
    SpreadsheetApp: {
      ProtectionType: { RANGE: "RANGE" },
      newDataValidation() {
        const rule = { values: [], showDropdown: true, allowInvalid: true };
        return {
          requireValueInList(values, showDropdown) {
            rule.values = values.slice();
            rule.showDropdown = showDropdown;
            return this;
          },
          setAllowInvalid(allowInvalid) {
            rule.allowInvalid = allowInvalid;
            return this;
          },
          build() {
            return rule;
          }
        };
      },
      openById(id) {
        if (id !== "test-spreadsheet") throw new Error("unknown spreadsheet");
        return spreadsheet;
      },
      flush() {}
    },
    PropertiesService: {
      getScriptProperties() {
        return propertyStore;
      }
    },
    CacheService: {
      getScriptCache() {
        return {
          get(key) {
            return cache.has(key) ? cache.get(key).value : null;
          },
          put(key, value) {
            cache.set(key, { value });
          }
        };
      }
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock() {
            return true;
          },
          releaseLock() {}
        };
      }
    },
    MailApp: mail,
    ScriptApp: {
      getProjectTriggers() {
        return triggers.slice();
      },
      deleteTrigger(trigger) {
        const index = triggers.indexOf(trigger);
        if (index >= 0) triggers.splice(index, 1);
      },
      newTrigger(handler) {
        const trigger = {
          handler,
          getHandlerFunction() {
            return this.handler;
          },
          timeBased() {
            return this;
          },
          everyMinutes() {
            this.interval = arguments[0];
            return this;
          },
          forSpreadsheet() {
            return this;
          },
          onChange() {
            return this;
          },
          create() {
            triggers.push(this);
            return this;
          }
        };
        return trigger;
      }
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput(content) {
        return {
          content,
          getContent() {
            return this.content;
          },
          setMimeType() {
            return this;
          }
        };
      }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" },
      Charset: { UTF_8: "UTF_8" },
      getUuid() {
        uuidState.count += 1;
        return "00000000-0000-4000-8000-" + String(uuidState.count).padStart(12, "0");
      },
      computeDigest(_algorithm, value) {
        return Array.from(crypto.createHash("sha256").update(String(value), "utf8").digest());
      },
      formatDate(date) {
        const shifted = new Date(date.getTime() + 330 * 60 * 1000);
        const pad = (value) => String(value).padStart(2, "0");
        return shifted.getUTCFullYear() + "-" +
          pad(shifted.getUTCMonth() + 1) + "-" +
          pad(shifted.getUTCDate()) + " " +
          pad(shifted.getUTCHours()) + ":" +
          pad(shifted.getUTCMinutes()) + ":" +
          pad(shifted.getUTCSeconds());
      }
    },
    Session: {
      getScriptTimeZone() {
        return "Asia/Kolkata";
      },
      getEffectiveUser() {
        return {
          getEmail() {
            return "owner@example.com";
          }
        };
      }
    },
    Logger: {
      log() {}
    }
  };

  vm.createContext(context);
  vm.runInContext(CODE, context, { filename: "Code.gs" });
  vm.runInContext(
    "CONFIG.SPREADSHEET_ID = \"test-spreadsheet\"; CONFIG.NOTIFICATION_EMAILS = " +
      JSON.stringify(recipients) + "; CONFIG.SEND_CONFIRMATION_EMAILS = " +
      String(confirmationEmails) + ";",
    context
  );

  function readResponse(response) {
    return JSON.parse(response.getContent());
  }

  function postForm(fields) {
    const parameters = {};
    const parameter = {};
    const encoded = new URLSearchParams();
    Object.entries(fields).forEach(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      parameters[key] = values;
      parameter[key] = Array.isArray(value) ? value[0] : value;
      values.forEach((item) => encoded.append(key, String(item)));
    });
    return readResponse(context.doPost({
      postData: { type: "application/x-www-form-urlencoded", contents: encoded.toString() },
      parameters,
      parameter
    }));
  }

  function postJson(fields) {
    return readResponse(context.doPost({
      postData: {
        type: "application/json",
        contents: JSON.stringify(fields)
      }
    }));
  }

  function postRaw(type, contents) {
    return readResponse(context.doPost({ postData: { type, contents } }));
  }

  return { context, spreadsheet, properties, triggers, mail, postForm, postJson, postRaw };
}

function siteSheet(harness, site = "example.com") {
  const sheet = harness.spreadsheet.getSheetByName(site);
  assert.ok(sheet, "Expected website sheet " + site);
  return sheet;
}

function queueRows(harness) {
  const sheet = harness.spreadsheet.getSheetByName("__FH_QUEUE");
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
}

test("setup is idempotent and initializes protected system sheets", () => {
  const harness = makeHarness({ recipients: ["admin@example.com", "bad-recipient"] });

  const first = harness.context.setup();
  const second = harness.context.setup();

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(harness.triggers.length, 2);
  const config = harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG");
  assert.ok(config);
  assert.equal(harness.spreadsheet.getSheets()[0].getName(), "__FH_SITE_CONFIG");
  assert.equal(config.isSheetHidden(), false);
  assert.deepEqual(config.getRange(1, 1, 1, 3).getValues()[0], ["site", "notification_emails", "enabled"]);
  assert.equal(harness.triggers.find((trigger) => trigger.handler === "processPendingNotifications").interval, 1);
  assert.ok(harness.spreadsheet.getSheetByName("__FH_QUEUE").isSheetHidden());
  assert.ok(harness.spreadsheet.getSheetByName("__FH_INDEX").isSheetHidden());
  ["__FH_QUEUE", "__FH_INDEX", "__FH_LOG"].forEach((name) => {
    const systemSheet = harness.spreadsheet.getSheetByName(name);
    const headerProtection = systemSheet.getProtections().find(
      (protection) => protection.getDescription() === "FormHarbour locked system header row"
    );
    const sheetProtection = systemSheet.getProtections().find(
      (protection) => protection.getDescription() === "FormHarbour locked system sheet"
    );
    assert.ok(headerProtection, "Expected protected system header for " + name);
    assert.ok(sheetProtection, "Expected protected system sheet for " + name);
    assert.equal(headerProtection.warningOnly, false);
    assert.equal(sheetProtection.warningOnly, false);
  });
  assert.equal(second.invalidRecipients.length, 1);
});

test("restores renamed system and configuration sheets", () => {
  const harness = makeHarness();
  harness.context.setup();
  harness.spreadsheet.getSheetByName("__FH_QUEUE").setName("renamed queue");
  harness.spreadsheet.getSheetByName("__FH_INDEX").setName("renamed index");
  harness.spreadsheet.getSheetByName("__FH_LOG").setName("renamed log");
  harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG").setName("renamed config");

  harness.context.handleSpreadsheetChange({ changeType: "OTHER" });

  assert.ok(harness.spreadsheet.getSheetByName("__FH_QUEUE"));
  assert.ok(harness.spreadsheet.getSheetByName("__FH_INDEX"));
  assert.ok(harness.spreadsheet.getSheetByName("__FH_LOG"));
  assert.ok(harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG"));
  assert.equal(harness.spreadsheet.getSheets()[0].getName(), "__FH_SITE_CONFIG");
  assert.equal(harness.spreadsheet.getSheetByName("__FH_QUEUE").isSheetHidden(), true);

  harness.spreadsheet.getSheetByName("__FH_QUEUE").setName("queue renamed again");
  harness.context.processPendingNotifications(1);
  assert.ok(harness.spreadsheet.getSheetByName("__FH_QUEUE"));
});

test("accepts repeated form keys, preserves blanks, creates Google Forms-style headers, and queues recipients", () => {
  const harness = makeHarness({ recipients: ["admin@example.com", "owner@example.com", "ADMIN@example.com", "bad"] });

  const response = harness.postForm({
    _site: "WWW.Example.COM",
    _submission_id: "submission-1",
    name: "Ada",
    message: ["Hello", "Second line"],
    phone: ""
  });

  assert.equal(response.status, "accepted");
  assert.equal(response.sourceWebsite, "example.com");
  assert.equal(response.notificationStatus, "processing");
  assert.equal(JSON.stringify(response).includes("admin@example.com"), false);

  const sheet = siteSheet(harness);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  assert.deepEqual(headers, [
    "Timestamp",
    "name",
    "message",
    "phone",
    "__fh_submission_id",
    "__fh_source_site",
    "__fh_notification_status"
  ]);

  const row = sheet.getRange(2, 1, 1, headers.length).getValues()[0];
  assert.match(String(row[0]), /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(row[1], "Ada");
  assert.equal(row[2], "Hello\nSecond line");
  assert.equal(row[3], "");
  assert.equal(row[4], "submission-1");
  assert.equal(row[5], "example.com");

  const protections = sheet.getProtections();
  assert.equal(protections.length, 4);
  assert.deepEqual(
    protections.filter((protection) => protection.getDescription().includes("reserved metadata"))
      .map((protection) => protection.range.column).sort((a, b) => a - b),
    [5, 6, 7]
  );
  assert.equal(protections.find((protection) => protection.getDescription() === "FormHarbour locked header row").range.row, 1);
  assert.equal(protections.every((protection) => protection.warningOnly === false), true);

  const states = JSON.parse(queueRows(harness)[0][12]);
  assert.deepEqual(states.map((state) => state.email), ["admin@example.com", "owner@example.com"]);
});

test("routes notifications by website configuration with global fallback", () => {
  const harness = makeHarness({ recipients: ["fallback@example.com"] });
  harness.context.setup();
  const config = harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG");
  config.getRange(2, 1, 3, 3).setValues([
    ["site-a.com", "a@example.com, b@example.com", "TRUE"],
    ["site-b.com", "c@example.com; d@example.com\nf@example.com", "TRUE"],
    ["site-disabled.com", "disabled@example.com", "FALSE"]
  ]);

  harness.postForm({ _site: "site-a.com", _submission_id: "site-a-1", name: "A" });
  harness.postForm({ _site: "site-b.com", _submission_id: "site-b-1", name: "B" });
  harness.postForm({ _site: "site-c.com", _submission_id: "site-c-1", name: "C" });
  const disabledResponse = harness.postForm({ _site: "site-disabled.com", _submission_id: "site-disabled-1", name: "Disabled" });

  assert.equal(disabledResponse.notificationStatus, "no_valid_recipients");
  assert.deepEqual(
    harness.mail.sentMail.map((mail) => mail.to),
    ["a@example.com", "b@example.com", "c@example.com", "d@example.com", "f@example.com", "fallback@example.com"]
  );
});

test("automatically adds new website sheets to site configuration", () => {
  const harness = makeHarness({ recipients: ["fallback@example.com"] });
  harness.postForm({ _site: "created.example.com", _submission_id: "created-1", name: "Created" });
  const config = harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG");
  assert.deepEqual(Array.from(config.getRange(2, 1, 1, 3).getValues()[0]), [
    "created.example.com",
    "fallback@example.com",
    "TRUE"
  ]);

  harness.spreadsheet.insertSheet("manual.example.com");
  harness.context.handleSpreadsheetChange({ changeType: "INSERT_GRID" });
  const configuredSites = Array.from(config.getRange(2, 1, config.getLastRow() - 1, 1).getValues()).map((row) => row[0]);
  assert.deepEqual(configuredSites, ["created.example.com", "manual.example.com"]);
  assert.equal(config.getRange(3, 2).getValues()[0][0], "fallback@example.com");
  assert.equal(harness.spreadsheet.getSheets()[0].getName(), "__FH_SITE_CONFIG");
});

test("evolves schema before operational columns and preserves previous row alignment", () => {
  const harness = makeHarness();
  const firstResponse = harness.postForm({ _site: "example.com", _submission_id: "one", name: "Ada", message: "Hello" });
  const secondResponse = harness.postForm({ _site: "example.com", _submission_id: "two", email: "ada@example.com" });
  assert.equal(firstResponse.status, "accepted", JSON.stringify(firstResponse));
  assert.equal(secondResponse.status, "accepted", JSON.stringify(secondResponse));

  const sheet = siteSheet(harness);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  assert.deepEqual(headers, [
    "Timestamp",
    "name",
    "message",
    "email",
    "__fh_submission_id",
    "__fh_source_site",
    "__fh_notification_status"
  ]);
  const rows = sheet.getRange(2, 1, 2, headers.length).getValues();
  assert.equal(rows[0][1], "Ada");
  assert.equal(rows[0][2], "Hello");
  assert.equal(rows[0][3], "");
  assert.equal(rows[1][1], "");
  assert.equal(rows[1][3], "ada@example.com");
  assert.deepEqual(
    sheet.getProtections().filter((protection) => protection.getDescription().includes("reserved metadata"))
      .map((protection) => protection.range.column).sort((a, b) => a - b),
    [5, 6, 7]
  );
});

test("preserves URL-encoded form control order when creating the first sheet", () => {
  const harness = makeHarness({ recipients: [] });
  const response = harness.postRaw(
    "application/x-www-form-urlencoded",
    "_site=example.com&_submission_id=order-test&name=Ada&email=ada%40example.com&phone=123&subject=Hello&message=Body"
  );
  assert.equal(response.status, "accepted");
  assert.deepEqual(
    siteSheet(harness).getRange(1, 1, 1, 9).getValues()[0],
    [
      "Timestamp",
      "name",
      "email",
      "phone",
      "subject",
      "message",
      "__fh_submission_id",
      "__fh_source_site",
      "__fh_notification_status"
    ]
  );
});

test("restores renamed website tabs and edited header cells", () => {
  const harness = makeHarness();
  harness.postForm({ _site: "example.com", _submission_id: "structure-1", name: "Ada" });
  harness.context.setup();

  const sheet = siteSheet(harness);
  sheet.setName("renamed.example.com");
  sheet.getRange(1, 2).setValue("changed header");

  harness.context.handleSpreadsheetChange({ changeType: "OTHER" });

  const restored = siteSheet(harness);
  assert.equal(restored.getName(), "example.com");
  assert.equal(restored.getRange(1, 2).getValues()[0][0], "name");
  assert.equal(restored.getProtections().length, 4);
});

test("restores renamed honeypot tabs and edited capture headers", () => {
  const harness = makeHarness();
  harness.postForm({
    _site: "example.com",
    _submission_id: "honeypot-structure-1",
    _honeypot: "filled",
    name: "Bot"
  });
  harness.context.setup();

  const sheet = harness.spreadsheet.getSheetByName("honeypot - example.com");
  sheet.setName("honeypot - renamed.example.com");
  sheet.getRange(1, 2).setValue("changed header");
  harness.context.handleSpreadsheetChange({ changeType: "OTHER" });

  const restored = harness.spreadsheet.getSheetByName("honeypot - example.com");
  assert.ok(restored);
  assert.equal(restored.getRange(1, 2).getValues()[0][0], "_site");
  assert.equal(restored.getProtections().length, 4);
});

test("deduplicates identical retries and rejects suspicious ID reuse", () => {
  const harness = makeHarness();
  const first = harness.postForm({ _site: "example.com", _submission_id: "same-id", name: "Ada" });
  const duplicate = harness.postForm({ _site: "WWW.EXAMPLE.COM", _submission_id: "same-id", name: "Ada" });
  const conflict = harness.postForm({ _site: "example.com", _submission_id: "same-id", name: "Grace" });

  assert.equal(first.status, "accepted");
  assert.equal(duplicate.status, "duplicate");
  assert.equal(conflict.status, "rejected");
  assert.equal(conflict.code, "submission_id_reused");
  assert.equal(siteSheet(harness).getLastRow(), 2);
  assert.equal(queueRows(harness).length, 1);
});

test("compacts UUID-shaped submission IDs while preserving retry identity", () => {
  const harness = makeHarness({ recipients: [] });
  const clientId = "ff3ed2d3-3cc1-41dc-9344-c619fd44190a";
  const first = harness.postForm({ _site: "example.com", _submission_id: clientId, name: "Ada" });
  const duplicate = harness.postForm({ _site: "example.com", _submission_id: clientId, name: "Ada" });

  assert.match(first.submissionId, /^fh-[0-9a-f]{16}$/);
  assert.equal(siteSheet(harness).getRange(2, 3).getValues()[0][0], first.submissionId);
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.submissionId, first.submissionId);
});

test("rejects malformed, unsupported, missing-site, honeypot, and reserved-field requests", () => {
  const harness = makeHarness();

  assert.equal(harness.postRaw("application/json", "{").code, "malformed_json");
  assert.equal(harness.postRaw("text/plain", "name=A").code, "unsupported_content_type");
  assert.equal(harness.postForm({ name: "Ada" }).code, "invalid_site");
  const spam = harness.postForm({
    _site: "example.com",
    _submission_id: "spam-1",
    _honeypot: "filled",
    name: "Bot",
    email: "bot@example.com"
  });
  assert.equal(spam.code, "spam_rejected");
  assert.equal(harness.spreadsheet.getSheetByName("example.com"), null);
  assert.equal(queueRows(harness).length, 0);
  const honeypotSheet = harness.spreadsheet.getSheetByName("honeypot - example.com");
  assert.ok(honeypotSheet, "Expected a separate honeypot capture sheet");
  assert.deepEqual(
    honeypotSheet.getRange(1, 1, 1, honeypotSheet.getLastColumn()).getValues()[0],
    [
      "Timestamp",
      "_site",
      "_submission_id",
      "_honeypot",
      "name",
      "email",
      "__fh_honeypot_read_status",
      "__fh_honeypot_mailed_status",
      "__fh_honeypot_window_id",
      "__fh_honeypot_window_deadline"
    ]
  );
  const capturedRow = honeypotSheet.getRange(2, 1, 1, 6).getValues()[0];
  assert.ok(capturedRow[0]);
  assert.deepEqual(capturedRow.slice(1), ["example.com", "spam-1", "filled", "Bot", "bot@example.com"]);
  assert.equal(honeypotSheet.getProtections().length, 4);
  assert.ok(honeypotSheet.dataValidations.length > 0);
  assert.equal(harness.postForm({ _site: "example.com", Timestamp: "spoofed" }).code, "reserved_field_name");
});

test("tracks honeypot read status and adds unread review context to genuine mail", () => {
  const harness = makeHarness({ recipients: ["admin@example.com"] });
  harness.postForm({
    _site: "example.com",
    _submission_id: "honeypot-read-test",
    _honeypot: "filled",
    name: "Bot"
  });
  const honeypotSheet = harness.spreadsheet.getSheetByName("honeypot - example.com");
  const headers = honeypotSheet.getRange(1, 1, 1, honeypotSheet.getLastColumn()).getValues()[0];
  const readColumn = headers.indexOf("__fh_honeypot_read_status") + 1;
  const mailedColumn = headers.indexOf("__fh_honeypot_mailed_status") + 1;
  assert.equal(honeypotSheet.getRange(2, readColumn).getValues()[0][0], "Unread");
  assert.equal(honeypotSheet.getRange(2, mailedColumn).getValues()[0][0], "Pending");
  assert.deepEqual(Array.from(honeypotSheet.dataValidations[0].rule.values), ["Unread", "Read"]);

  harness.postForm({
    _site: "example.com",
    _submission_id: "genuine-during-review-window",
    name: "Ada",
    message: "Hello"
  });
  assert.equal(harness.mail.sentMail.length, 1);
  assert.match(harness.mail.sentMail[0].body, /honeypot record\(s\) were also received in the last 5 days/);
  assert.match(harness.mail.sentMail[0].body, /View them:/);
  assert.match(harness.mail.sentMail[0].htmlBody, /View them in the honeypot sheet/);

  honeypotSheet.getRange(2, readColumn).setValue("Read");
  harness.context.processPendingNotifications();
  assert.equal(harness.mail.sentMail.length, 1);
  assert.equal(honeypotSheet.getRange(2, mailedColumn).getValues()[0][0], "Not required");
});

test("combines unread honeypots into one mailed digest after five days", () => {
  const harness = makeHarness({ recipients: ["admin@example.com"] });
  harness.postForm({
    _site: "example.com",
    _submission_id: "honeypot-digest-1",
    _honeypot: "filled",
    name: "Bot One"
  });
  harness.postForm({
    _site: "example.com",
    _submission_id: "honeypot-digest-2",
    _honeypot: "filled",
    name: "Bot Two"
  });

  const honeypotSheet = harness.spreadsheet.getSheetByName("honeypot - example.com");
  const headers = honeypotSheet.getRange(1, 1, 1, honeypotSheet.getLastColumn()).getValues()[0];
  const deadlineColumn = headers.indexOf("__fh_honeypot_window_deadline") + 1;
  const mailedColumn = headers.indexOf("__fh_honeypot_mailed_status") + 1;
  const expired = new Date(Date.now() - 1000).toISOString();
  honeypotSheet.getRange(2, deadlineColumn, 2, 1).setValues([[expired], [expired]]);

  const result = harness.context.processPendingNotifications();
  assert.equal(result.quotaBlocked, false);
  assert.equal(result.honeypotDigestsQueued, 1);
  assert.equal(harness.mail.sentMail.length, 1);
  assert.match(harness.mail.sentMail[0].subject, /Honeypot review \| example\.com/);
  assert.match(harness.mail.sentMail[0].body, /Records received: 2/);
  assert.match(harness.mail.sentMail[0].body, /Bot One/);
  assert.match(harness.mail.sentMail[0].body, /Bot Two/);
  assert.match(harness.mail.sentMail[0].htmlBody, /Open the honeypot sheet/);
  assert.equal(honeypotSheet.getRange(2, mailedColumn).getValues()[0][0], "Mailed");
  assert.equal(honeypotSheet.getRange(3, mailedColumn).getValues()[0][0], "Mailed");
});

test("escapes formula-shaped values before writing Sheets", () => {
  const harness = makeHarness();
  harness.postForm({
    _site: "example.com",
    _submission_id: "formula-test",
    note: "=SUM(1,1)"
  });
  const sheet = siteSheet(harness);
  assert.equal(sheet.getRange(2, 2).getValues()[0][0], "'=SUM(1,1)");
});

test("worker sends individually formatted notifications with website, timestamp, and all details", () => {
  const harness = makeHarness({ recipients: ["admin@example.com", "owner@example.com"] });
  harness.postForm({
    _site: "example.com",
    _submission_id: "mail-test",
    name: "Ada",
    message: "Hello <team>"
  });

  const result = harness.context.processPendingNotifications();
  assert.equal(result.quotaBlocked, false);
  assert.equal(result.processed, 0);
  assert.equal(harness.mail.sentMail.length, 2);
  harness.mail.sentMail.forEach((mail) => {
    assert.match(mail.subject, /New Form Submission \| example\.com/);
    assert.match(mail.body, /Website: example\.com/);
    assert.match(mail.body, /Received \(IST\):/);
    assert.match(mail.body, /name: Ada/);
    assert.match(mail.body, /message: Hello <team>/);
    assert.match(mail.htmlBody, /<h1[^>]*>New Form Submission<\/h1>/);
    assert.match(mail.htmlBody, /<a href="https:\/\/example\.com" style="color:#e5e7eb !important;text-decoration:underline !important;">example\.com<\/a>/);
    assert.match(mail.htmlBody, /Website<\/td>/);
    assert.match(mail.htmlBody, /Submitted data/);
    assert.equal(mail.name, "FormHarbour Notifications");
  });
  assert.equal(queueRows(harness)[0][7], "sent");
});

test("sends a saved-data confirmation to the submitted email field", () => {
  const harness = makeHarness({ recipients: ["admin@example.com"], confirmationEmails: true });
  const response = harness.postForm({
    _site: "example.com",
    _submission_id: "confirmation-test",
    name: "Ada",
    email: "ada@example.com",
    message: "Please confirm this"
  });

  assert.equal(response.status, "accepted");
  assert.equal(response.confirmationStatus, "processing");
  assert.equal(harness.mail.sentMail.length, 2);
  assert.match(harness.mail.sentMail[0].subject, /Submission saved \| example\.com/);
  assert.match(harness.mail.sentMail[0].body, /FORM SUBMISSION SAVED/);
  assert.match(harness.mail.sentMail[0].body, /Website: example\.com/);
  assert.match(harness.mail.sentMail[0].body, /email: ada@example\.com/);
  assert.match(harness.mail.sentMail[0].htmlBody, /Your form submission was saved/);
  assert.match(harness.mail.sentMail[1].subject, /New Form Submission \| example\.com/);
});

test("can disable submitter confirmation emails without disabling admin mail", () => {
  const harness = makeHarness({ recipients: ["admin@example.com"], confirmationEmails: false });
  const response = harness.postForm({
    _site: "example.com",
    _submission_id: "confirmation-disabled",
    email: "ada@example.com",
    message: "Do not confirm this"
  });

  assert.equal(response.confirmationStatus, "disabled");
  assert.equal(harness.mail.sentMail.length, 1);
  assert.match(harness.mail.sentMail[0].subject, /New Form Submission \| example\.com/);
});

test("quota exhaustion keeps the submission stored and leaves notification pending", () => {
  const harness = makeHarness({ remainingQuota: 0 });
  const response = harness.postForm({
    _site: "example.com",
    _submission_id: "quota-test",
    message: "Still store this"
  });

  const result = harness.context.processPendingNotifications();
  assert.equal(response.status, "accepted");
  assert.equal(response.notificationStatus, "queued");
  assert.equal(result.quotaBlocked, true);
  assert.equal(harness.mail.sentMail.length, 0);
  assert.equal(queueRows(harness)[0][7], "pending");
  assert.equal(siteSheet(harness).getLastRow(), 2);
});

test("partial delivery preserves per-recipient retry state", () => {
  const harness = makeHarness({
    recipients: ["admin@example.com", "owner@example.com"],
    failingRecipients: ["admin@example.com"]
  });
  harness.postForm({
    _site: "example.com",
    _submission_id: "partial-test",
    name: "Ada"
  });

  harness.context.processPendingNotifications();

  const row = queueRows(harness)[0];
  const states = JSON.parse(row[12]);
  assert.equal(states.find((state) => state.email === "admin@example.com").status, "retry");
  assert.equal(states.find((state) => state.email === "owner@example.com").status, "sent");
  assert.equal(row[7], "partial_retry");
});

test("corrupt queue recipient state is terminally failed without leaving a pending counter", () => {
  const harness = makeHarness({ recipients: ["admin@example.com"], remainingQuota: 0 });
  harness.postForm({
    _site: "example.com",
    _submission_id: "corrupt-queue-test",
    name: "Ada"
  });

  const queue = harness.spreadsheet.getSheetByName("__FH_QUEUE");
  queue.getRange(2, 13).setValue("not-json");
  harness.context.processPendingNotifications();

  assert.equal(queueRows(harness)[0][7], "failed");
  assert.equal(harness.properties.get("__FH_PENDING_COUNT"), "0");
  const site = siteSheet(harness);
  assert.equal(site.getRange(2, 5).getValues()[0][0], "failed");
});

test("testSubmission is a dry-run and health diagnostics report queue and trigger state", () => {
  const harness = makeHarness();
  const before = Array.from(harness.spreadsheet.sheets.keys());
  const dryRun = harness.context.testSubmission();
  const afterDryRun = Array.from(harness.spreadsheet.sheets.keys());
  const health = harness.context.checkSystemHealth();

  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.writes, false);
  assert.equal(dryRun.emailsSent, false);
  assert.deepEqual(afterDryRun, before);
  assert.equal(health.triggerCount, 0);
  assert.equal(health.pendingNotifications, 0);
});
