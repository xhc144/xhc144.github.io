'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const input = $('book-search');
  let controller, sequence = 0;
  const sourceLinks = [
    ['Z-Library', q => 'https://z-library.ec/s/' + encodeURIComponent(q)],
    ['Anna’s Archive', q => 'https://annas-archive.gl/search?' + new URLSearchParams({q})],
    ['LibGen', q => 'https://libgen.li/index.php?' + new URLSearchParams({req:q,res:'25','topics[]':'l','columns[]':'t'})],
    ['我的其他书库', () => 'https://xhc144.github.io/algebraic-geometry-corpus/']
  ];
  function links() {
    const q = input.value.trim();
    $('clear-search').hidden = !q;
    $('search-links').replaceChildren(...sourceLinks.map(([name, url]) => {
      const a = document.createElement('a'); a.textContent = name; a.href = url(q);
      a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
    }));
  }
  function message(title, note = '') {
    $('result').hidden = false;
    $('result-title').textContent = title;
    $('result-note').textContent = note;
    $('result-note').hidden = !note;
    $('versions').replaceChildren();
  }
  async function search() {
    const q = input.value.trim();
    if (!q) return;
    const service = window.BOOK_LOOKUP_CONFIG?.serviceUrl;
    if (service && new URL(service).origin !== location.origin) {
      location.assign(service + '/?q=' + encodeURIComponent(q)); return;
    }
    const request = ++sequence;
    controller?.abort(); controller = new AbortController();
    const activeController = controller;
    const timer = setTimeout(() => activeController.abort(), 65000);
    history.replaceState(null, '', location.pathname + '?q=' + encodeURIComponent(q));
    $('submit-search').disabled = true;
    $('result').setAttribute('aria-busy', 'true');
    message('正在查询…');
    try {
      const response = await fetch('./api/check', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({q}), signal:activeController.signal});
      if (!response.ok) throw new Error('Query unavailable');
      const result = await response.json();
      if (request !== sequence) return;
      if (result.status === 'found') {
        message(result.own ? '有，已有中文译稿' : '有中文版本');
        $('versions').replaceChildren(...(result.items || []).slice(0, 12).map(item => {
          const li = document.createElement('li');
          const title = document.createElement('span'); title.textContent = item.title; li.append(title);
          const brief = [item.edition, item.year].filter(Boolean).join(' · ');
          if (brief) {const meta = document.createElement('small'); meta.textContent = brief; li.append(meta);}
          return li;
        }));
      } else if (result.status === 'not_found') message('暂未查到', '可以换一个书名，或补充作者再查。');
      else if (result.status === 'uncertain') message('还不能确定', '试试更完整的书名、作者或版本。');
      else message('本次未能完成查询', '请稍后重试。');
    } catch (error) {
      if (request === sequence) message('本次未能完成查询', '请稍后重试。');
    } finally {
      clearTimeout(timer);
      if (request === sequence) {$('submit-search').disabled = false; $('result').removeAttribute('aria-busy');}
    }
  }
  $('search-form').addEventListener('submit', event => {event.preventDefault(); search();});
  input.addEventListener('input', () => {
    ++sequence; controller?.abort(); $('result').hidden = true;
    $('result').removeAttribute('aria-busy'); $('submit-search').disabled = false; links();
  });
  $('clear-search').addEventListener('click', () => {
    ++sequence; controller?.abort(); input.value = ''; $('result').hidden = true;
    $('submit-search').disabled = false; history.replaceState(null, '', location.pathname); links(); input.focus();
  });
  input.value = new URLSearchParams(location.search).get('q') || '';
  links();
  if (input.value.trim()) search();
})();
