// Preserve the recovery app's dependency-free runtime boundary.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const external = /src\s*=\s*["']https?:|from\s*["']https?:|import\(\s*["']https?:|<link[^>]*href\s*=\s*["']https?:/;
for (const name of fs.readdirSync('web')) {
  if (!/\.(js|html)$/.test(name)) continue;
  assert.ok(!external.test(fs.readFileSync('web/' + name, 'utf8')), 'external runtime import in ' + name);
}
console.log('Recovery app has no external runtime imports');
