const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const missing = spawnSync(process.execPath, ['test/browser.test.js'], {
  env: { ...process.env, PATH: '' }, encoding: 'utf8', timeout: 10000,
});
assert.equal(missing.status, 1, 'mandatory browser coverage must fail when Chromium is absent');
assert.match(missing.stderr, /Chrome\/Chromium is required/);
console.log('ok  missing browser fails rather than silently skipping coverage');

const fs = require('node:fs');
const workflows = fs.readdirSync('.github/workflows').filter(name => /\.ya?ml$/.test(name));
assert.ok(workflows.length > 0, 'workflow runtime guard must inspect workflows');
for (const name of workflows) {
  const workflow = fs.readFileSync('.github/workflows/' + name, 'utf8');
  assert.doesNotMatch(workflow, /uses:\s*paolino\/dev-assets\/setup-nix@/,
    name + ': shared setup still pulls in the Node.js 20 Cachix action');
  if (/\bnix (?:build|run|develop|flake)\b/.test(workflow)) {
    assert.match(workflow, /uses:\s*\.\/\.github\/actions\/setup-nix\s/,
      name + ': Nix jobs must use the audited local setup');
  }
}
const setup = fs.readFileSync('.github/actions/setup-nix/action.yml', 'utf8');
assert.match(setup, /uses:\s*cachix\/cachix-action@v17\s/,
  'Cachix v17 declares Node.js 24; audit metadata when changing this version');
assert.match(setup, /skipPush:\s*\$\{\{ inputs\.cachix-auth-token == '' \}\}/,
  'forks without a token must retain read-only cache access');
console.log('ok  every workflow uses the Node.js 24 cache helper with tokenless read-only access');
