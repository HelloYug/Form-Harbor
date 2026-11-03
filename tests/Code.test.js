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

  clearDataValidations() {
    const firstRow = this.row;
    const lastRow = this.row + this.rowCount - 1;
    const firstColumn = this.column;
    const lastColumn = this.column + this.columnCount - 1;
    this.sheet.dataValidations = this.sheet.dataValidations.filter((validation) => {
      const validationLastRow = validation.row + validation.rowCount - 1;
      const validationLastColumn = validation.column + validation.columnCount - 1;
      const overlapsRows = validation.row <= lastRow && validationLastRow >= firstRow;
      const overlapsColumns = validation.column <= lastColumn && validationLastColumn >= firstColumn;
      return !(overlapsRows && overlapsColumns);
    });
    return this;
  }

  setBackground() { return this; }

  setFontColor() { return this; }

  setFontWeight() { return this; }

  setHorizontalAlignment() { return this; }

  setVerticalAlignment() { return this; }

  setWrap() { return this; }

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
    this.autoResizeCalls = [];
    this.columnWidths = {};
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

  autoResizeColumns(startColumn, columnCount) {
    this.autoResizeCalls.push([startColumn, columnCount]);
  }

  autoResizeColumn(column) {
    this.autoResizeCalls.push([column, 1]);
  }

  getColumnWidth(column) {
    return this.columnWidths[column] || 100;
  }

  setColumnWidth(column, width) {
    this.columnWidths[column] = width;
    return this;
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
  let triggerSequence = 0;
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
          },
          remove(key) {
            cache.delete(key);
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
          uniqueId: "trigger-" + (++triggerSequence),
          getHandlerFunction() {
            return this.handler;
          },
          getUniqueId() {
            return this.uniqueId;
          },
          timeBased() {
            return this;
          },
          everyMinutes() {
            this.interval = arguments[0];
            return this;
          },
          after(delayMs) {
            this.delayMs = delayMs;
            return this;
          },
          atHour(hour) {
            this.hour = hour;
            return this;
          },
          everyDays(days) {
            this.days = days;
            return this;
          },
          forSpreadsheet() {
            return this;
          },
          onEdit() {
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
  assert.equal(harness.triggers.length, 5);
  const config = harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG");
  assert.ok(config);
  assert.equal(harness.spreadsheet.getSheets()[0].getName(), "__FH_SITE_CONFIG");
  assert.equal(config.isSheetHidden(), false);
  assert.deepEqual(config.getRange(1, 1, 1, 6).getValues()[0], [
    "site",
    "notification_emails",
    "enabled",
    "send_confirmation_emails",
    "show_confirmation_notification",
    "submission_sheet"
  ]);
  assert.equal(config.dataValidations.length, 0);
  assert.equal(harness.triggers.find((trigger) => trigger.handler === "processPendingNotifications").interval, 5);
  assert.deepEqual(
    harness.triggers.filter((trigger) => trigger.handler === "handleHeaderResize").map((trigger) => trigger.hour).sort((a, b) => a - b),
    [9, 18]
  );
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

test("migrates existing site configuration rows to the grouped-sheet column", () => {
  const harness = makeHarness();
  const config = harness.spreadsheet.insertSheet("__FH_SITE_CONFIG");
  config.getRange(1, 1, 2, 5).setValues([
    ["site", "notification_emails", "enabled", "send_confirmation_emails", "show_confirmation_notification"],
    ["legacy.example.com", "admin@example.com", "TRUE", "FALSE", "TRUE"]
  ]);

  harness.context.setup();

  assert.deepEqual(config.getRange(1, 1, 1, 6).getValues()[0], [
    "site",
    "notification_emails",
    "enabled",
    "send_confirmation_emails",
    "show_confirmation_notification",
    "submission_sheet"
  ]);
  assert.equal(config.getRange(2, 6).getValues()[0][0], "legacy.example.com");
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
  assert.equal(response.notificationStatus, "queued");
  assert.equal(JSON.stringify(response).includes("admin@example.com"), false);
  assert.equal(harness.mail.sentMail.length, 0);

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
  harness.context.processPendingNotifications();
  assert.deepEqual(
    harness.mail.sentMail.map((mail) => mail.to).sort(),
    ["a@example.com", "b@example.com", "c@example.com", "d@example.com", "f@example.com", "fallback@example.com"]
  );
});

test("groups alias domains into one record and honeypot sheet while preserving source domains", () => {
  const harness = makeHarness({ recipients: ["admin@example.com"] });
  harness.context.setup();
  const config = harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG");
  config.getRange(2, 1, 2, 6).setValues([
    ["brand.com", "admin@example.com", "TRUE", "FALSE", "TRUE", "brand.com"],
    ["brand.in", "admin@example.com", "TRUE", "FALSE", "TRUE", "brand.com"]
  ]);
  harness.context.handleSpreadsheetEdit({
    range: {
      getSheet() { return config; },
      getRow() { return 2; },
      getNumRows() { return 2; }
    }
  });

  const responses = [];
  for (let index = 0; index < 30; index += 1) {
    const sourceSite = index % 2 === 0 ? "brand.com" : "brand.in";
    responses.push(harness.postForm({
      _site: sourceSite,
      _submission_id: `alias-${index}`,
      name: `Alias ${index}`
    }));
  }
  const rateLimited = harness.postForm({
    _site: "brand.in",
    _submission_id: "alias-rate-limited",
    name: "Rate limited"
  });

  assert.ok(responses.every((response) => response.status === "accepted"));
  assert.equal(rateLimited.code, "rate_limited");
  const records = siteSheet(harness, "brand.com");
  assert.equal(harness.spreadsheet.getSheetByName("brand.in"), null);
  assert.equal(records.getLastRow(), 31);
  const headers = records.getRange(1, 1, 1, records.getLastColumn()).getValues()[0];
  const sourceColumn = headers.indexOf("__fh_source_site") + 1;
  const sources = records.getRange(2, sourceColumn, 30, 1).getValues().flat();
  assert.equal(sources.filter((source) => source === "brand.com").length, 15);
  assert.equal(sources.filter((source) => source === "brand.in").length, 15);
  assert.equal(queueRows(harness).length, 30);
  assert.ok(queueRows(harness).every((row) => row[2] === "brand.com"));

  const configRows = config.getRange(2, 1, 2, 6).getValues();
  assert.deepEqual(configRows.map((row) => row[5]), ["brand.com", "brand.com"]);

  const honeypotHarness = makeHarness({ recipients: ["admin@example.com"] });
  honeypotHarness.context.setup();
  const honeypotConfig = honeypotHarness.spreadsheet.getSheetByName("__FH_SITE_CONFIG");
  honeypotConfig.getRange(2, 1, 2, 6).setValues([
    ["brand.com", "admin@example.com", "TRUE", "FALSE", "TRUE", "brand.com"],
    ["brand.in", "admin@example.com", "TRUE", "FALSE", "TRUE", "brand.com"]
  ]);
  honeypotHarness.context.handleSpreadsheetEdit({
    range: {
      getSheet() { return honeypotConfig; },
      getRow() { return 2; },
      getNumRows() { return 2; }
    }
  });
  honeypotHarness.postForm({
    _site: "brand.com",
    _submission_id: "honeypot-com",
    _honeypot: "filled",
    name: "Com bot"
  });
  honeypotHarness.postForm({
    _site: "brand.in",
    _submission_id: "honeypot-in",
    _honeypot: "filled",
    name: "In bot"
  });
  const groupedHoneypot = honeypotHarness.spreadsheet.getSheetByName("honeypot - brand.com");
  assert.ok(groupedHoneypot);
  assert.equal(honeypotHarness.spreadsheet.getSheetByName("honeypot - brand.in"), null);
  assert.equal(groupedHoneypot.getLastRow(), 3);
});

test("routes confirmation email and frontend notice settings per website", () => {
  const harness = makeHarness({ recipients: ["fallback@example.com"], confirmationEmails: false });
  harness.context.setup();
  const config = harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG");
  config.getRange(2, 1, 2, 5).setValues([
    ["site-a.com", "a@example.com", "TRUE", "TRUE", "FALSE"],
    ["site-b.com", "b@example.com", "TRUE", "FALSE", "TRUE"]
  ]);

  const siteA = harness.postForm({
    _site: "site-a.com",
    _submission_id: "site-a-settings-1",
    email: "submitter-a@example.com",
    name: "A"
  });
  const siteB = harness.postForm({
    _site: "site-b.com",
    _submission_id: "site-b-settings-1",
    email: "submitter-b@example.com",
    name: "B"
  });

  assert.equal(siteA.showConfirmationNotification, false);
  assert.equal(siteA.confirmationStatus, "queued");
  assert.equal(siteB.showConfirmationNotification, true);
  assert.equal(siteB.confirmationStatus, "disabled");
  assert.equal(harness.mail.sentMail.length, 0);
  harness.context.processPendingNotifications();
  assert.deepEqual(
    harness.mail.sentMail.map((mail) => mail.to).sort(),
    ["submitter-a@example.com", "a@example.com", "b@example.com"].sort()
  );
});

test("invalidates site configuration cache when a new site row is created", () => {
  const harness = makeHarness({ recipients: ["fallback@example.com"] });
  harness.postForm({ _site: "cache.example.com", _submission_id: "cache-1", name: "First" });
  const config = harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG");
  config.getRange(2, 2).setValue("site-owner@example.com");

  harness.postForm({ _site: "cache.example.com", _submission_id: "cache-2", name: "Second" });
  const states = JSON.parse(queueRows(harness)[1][12]);
  assert.deepEqual(states.map((state) => state.email), ["site-owner@example.com"]);
});

test("invalidates all site configuration caches after a config-sheet edit", () => {
  const harness = makeHarness({ recipients: ["fallback@example.com"] });
  harness.postForm({ _site: "edited-cache.example.com", _submission_id: "edited-cache-1", name: "First" });
  const config = harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG");
  config.getRange(2, 2).setValue("updated-owner@example.com");
  harness.context.handleSpreadsheetEdit({
    range: {
      getSheet() { return config; },
      getRow() { return 2; },
      getNumRows() { return 1; }
    }
  });

  harness.postForm({ _site: "edited-cache.example.com", _submission_id: "edited-cache-2", name: "Second" });
  const states = JSON.parse(queueRows(harness)[1][12]);
  assert.deepEqual(states.map((state) => state.email), ["updated-owner@example.com"]);
});

test("coalesces a delayed notification recovery trigger for a queue burst", () => {
  const harness = makeHarness({ recipients: ["admin@example.com"] });
  harness.context.setup();
  harness.postForm({ _site: "recovery.example.com", _submission_id: "recovery-1", name: "First" });
  harness.postForm({ _site: "recovery.example.com", _submission_id: "recovery-2", name: "Second" });

  const recoveryTriggers = harness.triggers.filter((trigger) =>
    trigger.handler === "processPendingNotifications" && trigger.delayMs === 6 * 60 * 1000
  );
  assert.equal(recoveryTriggers.length, 1);
  assert.equal(harness.triggers.filter((trigger) => trigger.handler === "processPendingNotifications").length, 2);

  harness.context.processPendingNotifications();
  assert.equal(harness.triggers.filter((trigger) => trigger.handler === "processPendingNotifications").length, 1);
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
  assert.equal(config.getRange(2, 6).getValues()[0][0], "created.example.com");
  assert.deepEqual(
    config.dataValidations.slice(-3).map((validation) => [validation.row, validation.column, validation.rule.values.join(",")]),
    [
      [2, 3, "TRUE,FALSE"],
      [2, 4, "TRUE,FALSE"],
      [2, 5, "TRUE,FALSE"]
    ]
  );

  harness.spreadsheet.insertSheet("manual.example.com");
  harness.context.handleSpreadsheetChange({ changeType: "INSERT_GRID" });
  const configuredSites = Array.from(config.getRange(2, 1, config.getLastRow() - 1, 1).getValues()).map((row) => row[0]);
  assert.deepEqual(configuredSites, ["created.example.com", "manual.example.com"]);
  assert.equal(config.getRange(3, 2).getValues()[0][0], "fallback@example.com");
  assert.equal(harness.spreadsheet.getSheets()[0].getName(), "__FH_SITE_CONFIG");
});

test("resizes managed columns during setup", () => {
  const harness = makeHarness({ recipients: ["admin@example.com"] });
  harness.context.setup();

  const config = harness.spreadsheet.getSheetByName("__FH_SITE_CONFIG");
  assert.ok(config.autoResizeCalls.length > 0);
  assert.ok(config.columnWidths[4] >= "send_confirmation_emails".length * 8 + 24);
  assert.ok(harness.spreadsheet.getSheetByName("__FH_QUEUE").autoResizeCalls.length > 0);
  assert.ok(harness.spreadsheet.getSheetByName("__FH_INDEX").autoResizeCalls.length > 0);
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

test("runtime submission paths restore renamed managed tabs before use", () => {
  const harness = makeHarness({ recipients: ["admin@example.com"] });
  harness.context.setup();
  harness.postForm({ _site: "example.com", _submission_id: "runtime-rename-1", name: "First" });

  const queue = harness.spreadsheet.getSheetByName("__FH_QUEUE");
  const website = harness.spreadsheet.getSheetByName("example.com");
  const sheetCount = harness.spreadsheet.getSheets().length;
  queue.setName("renamed queue");
  website.setName("renamed website");

  const response = harness.postForm({
    _site: "example.com",
    _submission_id: "runtime-rename-2",
    name: "Second"
  });

  assert.equal(response.status, "accepted");
  assert.equal(harness.spreadsheet.getSheets().length, sheetCount);
  assert.ok(harness.spreadsheet.getSheetByName("__FH_QUEUE"));
  assert.ok(harness.spreadsheet.getSheetByName("example.com"));
  assert.equal(harness.spreadsheet.getSheetByName("renamed queue"), null);
  assert.equal(harness.spreadsheet.getSheetByName("renamed website"), null);
  assert.equal(siteSheet(harness).getLastRow(), 3);
  assert.equal(queueRows(harness).length, 2);
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

test("compacts UUID-shaped honeypot IDs in the capture sheet", () => {
  const harness = makeHarness({ recipients: [] });
  const clientId = "0e26cba6-2e57-460a-b2f4-22943a564959";
  harness.postForm({
    _site: "example.com",
    _submission_id: clientId,
    _honeypot: "filled",
    name: "Bot"
  });

  const sheet = harness.spreadsheet.getSheetByName("honeypot - example.com");
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const idColumn = headers.indexOf("_submission_id") + 1;
  const storedId = sheet.getRange(2, idColumn).getValues()[0][0];
  assert.match(storedId, /^fh-[0-9a-f]{16}$/);
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
  harness.context.processPendingNotifications();
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
  assert.deepEqual(
    honeypotSheet.dataValidations.map((validation) => [validation.row, validation.rowCount]),
    [[2, 1], [3, 1]]
  );
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
  assert.equal(result.processed, 2);
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
  assert.equal(response.confirmationStatus, "queued");
  assert.equal(harness.mail.sentMail.length, 0);
  harness.context.processPendingNotifications();
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
  assert.equal(harness.mail.sentMail.length, 0);
  harness.context.processPendingNotifications();
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

test("worker recovers a stored row when the initial queue append fails", () => {
  const harness = makeHarness({ recipients: ["admin@example.com"] });
  harness.context.setup();
  const queue = harness.spreadsheet.getSheetByName("__FH_QUEUE");
  const originalAppendRow = queue.appendRow;
  let failOnce = true;
  queue.appendRow = function(values) {
    if (failOnce) {
      failOnce = false;
      throw new Error("temporary queue append failure");
    }
    return originalAppendRow.call(queue, values);
  };

  const response = harness.postForm({
    _site: "example.com",
    _submission_id: "deferred-queue-test",
    name: "Ada",
    message: "Persist this before queue recovery"
  });

  assert.equal(response.status, "accepted");
  assert.equal(response.notificationStatus, "deferred_queue_error");
  assert.equal(queueRows(harness).length, 0);
  assert.equal(siteSheet(harness).getRange(2, 6).getValues()[0][0], "deferred_queue_error");

  queue.appendRow = originalAppendRow;
  const result = harness.context.processPendingNotifications();
  assert.equal(result.deferredSubmissionsQueued, 1);
  assert.equal(result.processed, 1);
  assert.equal(harness.mail.sentMail.length, 1);
  assert.equal(queueRows(harness)[0][7], "sent");
  assert.equal(siteSheet(harness).getRange(2, 6).getValues()[0][0], "sent");
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

// ---------------------------------------------------------------------------
// Load and concurrency-style burst scenarios
// ---------------------------------------------------------------------------

test("load burst stores 100 submissions across four websites without loss", async () => {
  // Give the worker enough daily quota to process the full synthetic batch
  // while still exercising its quota accounting in the other test cases.
  const harness = makeHarness({ recipients: ["admin@example.com"], remainingQuota: 200 });
  const sites = ["load-a.example.com", "load-b.example.com", "load-c.example.com", "load-d.example.com"];
  const submissions = [];

  // Twenty-five submissions per site stays within the configured
  // 30-request-per-site rolling window while still exercising a 100-request
  // burst across the shared workbook, queue, and dynamic schema logic.
  sites.forEach((site) => {
    for (let index = 0; index < 25; index += 1) {
      const fields = {
        _site: site,
        _submission_id: `${site}-load-${index}`,
        name: `Submitter ${index}`
      };
      // These staged fields force each site's schema to evolve while rows are
      // being appended, including a field added after the first submissions.
      if (index >= 1) fields.email = `submitter-${index}@example.com`;
      if (index >= 2) fields.message = `Message ${index}`;
      if (index === 10) fields.phone = "7011403558";
      submissions.push(fields);
    }
  });

  const responses = await Promise.all(
    submissions.map((fields) => Promise.resolve().then(() => harness.postForm(fields)))
  );

  assert.equal(responses.filter((response) => response.status === "accepted").length, 100);
  assert.equal(responses.filter((response) => response.status !== "accepted").length, 0);
  assert.equal(queueRows(harness).length, 100);
  assert.equal(harness.properties.get("__FH_PENDING_COUNT"), "100");

  sites.forEach((site) => {
    const sheet = siteSheet(harness, site);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    assert.deepEqual(headers, [
      "Timestamp",
      "name",
      "email",
      "message",
      "phone",
      "__fh_submission_id",
      "__fh_source_site",
      "__fh_notification_status"
    ]);
    assert.equal(sheet.getLastRow(), 26);
    const ids = sheet.getRange(2, 6, 25, 1).getValues().flat();
    assert.equal(new Set(ids).size, 25);
  });

  // The worker intentionally caps each execution at 25 attempts. Repeated
  // worker runs prove that the full durable queue drains without omissions.
  for (let run = 0; run < 10 && harness.properties.get("__FH_PENDING_COUNT") !== "0"; run += 1) {
    harness.context.processPendingNotifications(1000);
  }
  assert.equal(harness.properties.get("__FH_PENDING_COUNT"), "0");
  assert.equal(harness.mail.sentMail.length, 100);
  assert.ok(queueRows(harness).every((row) => row[7] === "sent"));
});

test("load burst applies the per-site rate limit without losing accepted rows", async () => {
  const harness = makeHarness({ recipients: ["admin@example.com"] });
  const responses = await Promise.all(
    Array.from({ length: 100 }, (_, index) => Promise.resolve().then(() => harness.postForm({
      _site: "rate-load.example.com",
      _submission_id: `rate-load-${index}`,
      name: `Rate test ${index}`,
      message: `Message ${index}`
    })))
  );

  const accepted = responses.filter((response) => response.status === "accepted");
  const rateLimited = responses.filter((response) => response.code === "rate_limited");
  assert.equal(accepted.length, 30);
  assert.equal(rateLimited.length, 70);
  assert.equal(responses.length, accepted.length + rateLimited.length);

  const sheet = siteSheet(harness, "rate-load.example.com");
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  assert.deepEqual(headers, [
    "Timestamp",
    "name",
    "message",
    "__fh_submission_id",
    "__fh_source_site",
    "__fh_notification_status"
  ]);
  assert.equal(sheet.getLastRow(), 31);
  assert.equal(queueRows(harness).length, 30);
  assert.equal(harness.properties.get("__FH_PENDING_COUNT"), "30");

  // Every accepted response must correspond to exactly one persisted row and
  // one durable queue item; rate-limited requests are not storage losses.
  const persistedIds = new Set(sheet.getRange(2, 4, 30, 1).getValues().flat());
  assert.equal(persistedIds.size, 30);
  accepted.forEach((response) => assert.ok(persistedIds.has(response.submissionId)));
});

test("duplicate burst creates one row and one queue item per unique submission", async () => {
  const harness = makeHarness({ recipients: ["admin@example.com"] });
  const requests = [];
  for (let index = 0; index < 12; index += 1) {
    const fields = {
      _site: "duplicate-load.example.com",
      _submission_id: `duplicate-load-${index}`,
      name: `Duplicate test ${index}`
    };
    requests.push(fields, { ...fields });
  }

  const responses = await Promise.all(
    requests.map((fields) => Promise.resolve().then(() => harness.postForm(fields)))
  );
  assert.equal(responses.filter((response) => response.status === "accepted").length, 12);
  assert.equal(responses.filter((response) => response.status === "duplicate").length, 12);
  assert.equal(queueRows(harness).length, 12);
  assert.equal(siteSheet(harness, "duplicate-load.example.com").getLastRow(), 13);
  assert.equal(harness.properties.get("__FH_PENDING_COUNT"), "12");
});

test("load retry burst preserves all queue items and recovers after delivery resumes", async () => {
  const harness = makeHarness({
    recipients: ["admin@example.com"],
    failingRecipients: ["admin@example.com"]
  });
  const responses = await Promise.all(
    Array.from({ length: 25 }, (_, index) => Promise.resolve().then(() => harness.postForm({
      _site: "retry-load.example.com",
      _submission_id: `retry-load-${index}`,
      name: `Retry test ${index}`
    })))
  );
  assert.ok(responses.every((response) => response.status === "accepted"));
  assert.equal(queueRows(harness).length, 25);

  harness.context.processPendingNotifications(1000);
  assert.equal(harness.properties.get("__FH_PENDING_COUNT"), "25");
  assert.ok(queueRows(harness).every((row) => row[7] === "retry"));

  // Make the retry window due immediately; production workers normally wait
  // for the bounded backoff timestamp before claiming these rows.
  const queue = harness.spreadsheet.getSheetByName("__FH_QUEUE");
  queueRows(harness).forEach((row, index) => {
    const states = JSON.parse(row[12]);
    states.forEach((state) => { state.nextAttemptAt = 0; });
    queue.getRange(index + 2, 13).setValue(JSON.stringify(states));
  });
  harness.mail.failingRecipients.clear();
  harness.context.processPendingNotifications(1000);

  assert.equal(harness.properties.get("__FH_PENDING_COUNT"), "0");
  assert.equal(harness.mail.sentMail.length, 25);
  assert.ok(queueRows(harness).every((row) => row[7] === "sent"));
});
