'use strict';
// 普通访客拦截。公开静态网页无法提供服务端访问控制。
(() => {
  const CONFIG = {salt: 'd838388304262fc8b7d93ea4a6467cbd', digest: '9c4a28db8f9d1788a2300ad452292644fece92e8139eb34aff241ea01e7028e5', version: '06a74c451cf8081a'};
  const KEY = 'xhc144-site-access';
  const MAX_AGE = 12 * 60 * 60 * 1000;
  const root = document.documentElement;
  let approved = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    approved = saved?.version === CONFIG.version && saved?.digest === CONFIG.digest &&
      Number.isFinite(saved?.at) && saved.at <= Date.now() && Date.now() - saved.at < MAX_AGE;
  } catch (_) { /* 禁用存储时仍允许当前页验证。 */ }
  if (approved) root.setAttribute('data-site-access', 'open');

  function mount() {
    if (document.getElementById('site-access-gate')) return;
    const gate = document.createElement('section');
    gate.id = 'site-access-gate';
    gate.setAttribute('aria-label', '网站访问验证');
    gate.innerHTML = `<form class="access-card">
      <div class="access-mark" aria-hidden="true">Σ</div>
      <p class="access-eyebrow">xhc144</p>
      <h1>请输入访问密码</h1>
      <p class="access-description">验证后即可继续浏览。</p>
      <label for="site-access-password">访问密码</label>
      <div class="access-input-row"><input id="site-access-password" type="password" autocomplete="current-password" required spellcheck="false" autocapitalize="off" aria-describedby="site-access-error"><button class="access-reveal" type="button" aria-label="显示密码" aria-pressed="false">显示</button></div>
      <p id="site-access-error" role="status" aria-live="polite"></p>
      <button class="access-submit" type="submit">进入网站 <span aria-hidden="true">→</span></button>
    </form>`;
    const form = gate.querySelector('form');
    const input = gate.querySelector('input');
    const error = gate.querySelector('[role="status"]');
    const submit = gate.querySelector('[type="submit"]');
    const reveal = gate.querySelector('.access-reveal');
    reveal.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      reveal.textContent = show ? '隐藏' : '显示';
      reveal.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
      reveal.setAttribute('aria-pressed', String(show));
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      error.textContent = '';
      try {
        const bytes = new TextEncoder().encode(CONFIG.salt + ':' + input.value);
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
        if (digest !== CONFIG.digest) {
          error.textContent = '密码不正确，请重新输入。';
          input.setAttribute('aria-invalid', 'true');
          input.select();
          return;
        }
        try { sessionStorage.setItem(KEY, JSON.stringify({version: CONFIG.version, digest, at: Date.now()})); } catch (_) {}
        input.value = '';
        input.type = 'password';
        approved = true;
        root.setAttribute('data-site-access', 'open');
        logout.hidden = false;
        const heading = document.querySelector('main h1, body > h1, .site-home');
        if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({preventScroll: true}); }
      } catch (_) {
        error.textContent = '验证暂不可用，请使用现代浏览器通过 HTTPS 打开。';
      } finally { submit.disabled = false; }
    });
    const logout = document.createElement('button');
    logout.id = 'site-access-logout';
    logout.type = 'button';
    logout.textContent = '退出访问';
    logout.hidden = !approved;
    logout.addEventListener('click', () => {
      try { sessionStorage.removeItem(KEY); } catch (_) {}
      approved = false;
      root.removeAttribute('data-site-access');
      logout.hidden = true;
      error.textContent = '';
      input.value = '';
      input.removeAttribute('aria-invalid');
      input.focus();
    });
    document.body.append(gate, logout);
    if (!approved) input.focus({preventScroll: true});
    // bfcache 恢复也重新核对是否已在另一个页面退出。
    addEventListener('pageshow', () => {
      if (!approved) return;
      let valid = false;
      try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); valid = s?.version === CONFIG.version && s?.digest === CONFIG.digest && Date.now() - s.at < MAX_AGE; } catch (_) {}
      if (!valid) { approved = false; root.removeAttribute('data-site-access'); logout.hidden = true; }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once: true});
  else mount();
})();
