import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {protectHtml, protectDirectory} from '../scripts/enforce-access-gate.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('publication includes all current pages and guard precedes existing scripts', () => {
  assert.equal(protectDirectory(path.join(root, 'docs'), true), 5);
  for (const file of ['index.html', 'materials/index.html', 'repos/index.html', 'translations/index.html']) {
    const html = fs.readFileSync(path.join(root, 'docs', file), 'utf8');
    assert.match(html.slice(0, 400), /access-gate\.js/);
  }
});
test('compact redirects with implicit head are guarded before redirect and preserve hash handling', () => {
  const input = '<!doctype html><html><meta charset="utf-8"><script>location.replace("./page.html"+location.hash)</script></html>';
  const output = protectHtml(input);
  assert(output.indexOf('access-gate.js') < output.indexOf('location.replace'));
  assert(output.includes('+location.hash'));
  assert.equal(protectHtml(output), output);
});
test('full documents and fragments are idempotent and preserve source content', () => {
  for (const input of ['<!doctype html><html><head></head><body><p>内容</p></body></html>', '<h1>内容</h1>']) {
    const output = protectHtml(input);
    assert.match(output, /data-access-gate/);
    assert.match(output, /内容/);
    assert.equal(protectHtml(output), output);
  }
});
