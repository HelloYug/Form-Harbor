# Contributing to FormHarbour 🤝

Thanks for helping improve FormHarbour.

## 🧪 Local checks

Run the dependency-free test suite from the repository root:

```text
npm test
```

Before opening a pull request, also check the Apps Script source syntax:

```text
Get-Content Code.gs -Raw | node --check --input-type=commonjs -
```

Check the local browser client files as well:

```text
node --check test-form/app.js
node --check test-form/config.js
git diff --check
```

For a browser smoke test, serve the client over IPv4 from `test-form/`:

```text
python -m http.server 4173 --bind 127.0.0.1
```

## ⚙️ Apps Script workflow

`Code.gs` is copied into a Google Apps Script project. Do not commit real
Spreadsheet IDs, notification addresses, deployed URLs, credentials, or form
submissions. Keep local configuration placeholders in the repository and apply
account-specific values only in your private Apps Script and test-client copies.

When changing the backend, update the setup documentation and add or update a
behavioral test when practical. Feature changes should keep these documents in
sync where applicable: `README.md`, `docs/SETUP.md`,
`docs/FRONTEND_INTEGRATION.md`, and `docs/HANDOVER.md`. Update the documented
test count when the behavioral suite changes, and record architectural changes
in the local `.version_history/VERSION_TASKS.md` file.
