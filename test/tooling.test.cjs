const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const missing = spawnSync(process.execPath, ['test/browser.test.js'], {
  env: { ...process.env, PATH: '' }, encoding: 'utf8', timeout: 10000,
});
assert.equal(missing.status, 1, 'mandatory browser coverage must fail when Chromium is absent');
assert.match(missing.stderr, /Chrome\/Chromium is required/);
console.log('ok  missing browser fails rather than silently skipping coverage');
