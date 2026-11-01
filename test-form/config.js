/*
 * FormHarbour test client configuration.
 *
 * Replace EXEC_URL with the deployed Apps Script Web App URL ending in /exec.
 * Do not use the Apps Script editor /dev URL for website testing.
 *
 * SITE_OVERRIDE is optional. Leave it empty on a real domain so the client
 * uses window.location.hostname. For localhost/file:// testing, set it to a
 * valid hostname such as test.example.com because the backend rejects
 * localhost as an unsafe website identifier.
 */
window.FORMHARBOUR_CONFIG = Object.freeze({
  EXEC_URL: "PASTE_YOUR_DEPLOYED_EXEC_URL_HERE",
  SITE_OVERRIDE: "test.example.com",

  // Set false if this frontend should not show the browser-level saved notice.
  // This does not change backend storage or email delivery.
  SHOW_CONFIRMATION_NOTIFICATION: true
});
