# Contributing to FormHarbour

Thanks for helping improve FormHarbour.

## Local checks

Run the dependency-free test suite from the repository root:

```text
npm test
```

Before opening a pull request, also check the Apps Script source syntax:

```text
Get-Content Code.gs -Raw | node --check --input-type=commonjs -
```

## Apps Script workflow

`Code.gs` is copied into a Google Apps Script project. Do not commit real
Spreadsheet IDs, notification addresses, deployed URLs, credentials, or form
submissions. Keep local configuration placeholders in the repository and apply
account-specific values only in your private Apps Script and test-client copies.

When changing the backend, update the setup documentation and add or update a
behavioral test when practical.
