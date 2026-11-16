import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const home = read('docs/index.html');
const index = JSON.parse(home.match(/id="index-data">([\s\S]*?)<\/script>/)[1]);
const hrefs = [...home.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => match[1]);
const required = ['repos/', 'materials/', 'translations/',
  'https://xhc144.github.io/open-friend-tree/',
  'https://xhc144.github.io/gd-math-results/',
  'https://xhc144.github.io/algebraic-geometry-corpus/',
  'http://106.55.36.106/', 'http://106.55.36.106/personal/',
  ...['archive/', 'news/', 'media/', 'math/', 'physics/', 'projects/', 'notes/',
    'categories/Lean/', 'honors/', 'about/', 'contact/', 'search/']
    .map(path => 'http://106.55.36.106/personal/' + path)];
for (const url of required) {
  assert(hrefs.includes(url), 'Missing visible homepage link: ' + url);
  assert(index.some(item => item.u === url), 'Missing searchable homepage link: ' + url);
}
assert.equal(new Set(index.map(item => item.u)).size, index.length, 'No duplicate search destinations');
assert(index.some(item => item.t === '个人博客'));
assert(index.some(item => item.t === '每日新闻'));
assert(!/[?]{2,}|\uFFFD/.test(home), 'Homepage has no corrupted Chinese labels');
for (const file of ['docs/index.html', 'docs/repos/index.html', 'docs/materials/index.html', 'docs/translations/index.html']) {
  const text = read(file);
  assert(!/href="[^\"]*claude-lab\//.test(text), file + ': no dead laboratory navigation');
  if (file !== 'docs/index.html') {
    assert(/class="site-home"[^>]*>[\s\S]*?<svg\b/.test(text), file + ': stable vector brand');
    assert(text.includes('site.css?v=20261116-nav'), file + ': refreshed shared stylesheet');
  }
}
console.log('Homepage navigation: 20 required destinations visible and searchable; dead links excluded; shared vector brand present');
