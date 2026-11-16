'use strict';
(function () {
  const $ = id => document.getElementById(id);
  const input = $('book-search');
  let books = [], filter = 'all';
  const element = (tag, className, text) => {
    const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
  };
  function card(book) {
    const article = document.createElement('article'); article.className = 'book';
    const heading = element('div', 'book-heading', '');
    heading.append(element('h2', '', book.title));
    if (book.series) heading.append(element('span', 'series', book.series));
    article.append(heading);
    if (book.originalTitle && book.originalTitle !== book.title) article.append(element('p', 'original-title', book.originalTitle));
    if (book.author) article.append(element('p', 'author', book.author));
    const tags = element('div', 'tags', '');
    if (book.translation) tags.append(element('span', 'tag own', '已有译稿'));
    if (book.ownedChineseEdition) tags.append(element('span', 'tag own', '已有中文版'));
    if (book.chineseEdition) tags.append(element('span', 'tag chinese', book.chineseEdition.manuscript ? '已查到中文译稿' : '已查到中文版'));
    article.append(tags);
    if (book.translation?.progress) article.append(element('p', 'progress', book.translation.progress));
    if (book.chineseEdition?.title) article.append(element('p', 'edition', '中文版：《' + book.chineseEdition.title + '》'));
    return article;
  }
  function readState() {
    const params = new URLSearchParams(location.search);
    input.value = params.get('q') || '';
    filter = ['all', 'mine', 'chinese'].includes(params.get('filter')) ? params.get('filter') : 'all';
  }
  function render(updateUrl = true) {
    const found = books.filter(book => translationSearch.matches(book, input.value, filter));
    $('book-list').replaceChildren(...found.map(card));
    $('empty-state').hidden = found.length > 0;
    $('results-status').textContent = input.value.trim() ? '找到 ' + found.length + ' 本书' : '共 ' + found.length + ' 本书';
    $('clear-search').hidden = !input.value;
    document.querySelectorAll('[data-filter]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
    if (updateUrl) {
      const params = new URLSearchParams();
      if (input.value.trim()) params.set('q', input.value.trim());
      if (filter !== 'all') params.set('filter', filter);
      history.replaceState(null, '', location.pathname + (params.size ? '?' + params : ''));
    }
  }
  async function load() {
    $('load-error').hidden = true;
    $('results-status').textContent = '正在载入书目…';
    try {
      const response = await fetch('./books.json');
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!Array.isArray(data.books)) throw new Error('Invalid catalog');
      books = data.books;
      $('updated').textContent = data.updated;
      $('updated').dateTime = data.updated;
      render(false);
    } catch (error) {
      $('book-list').replaceChildren(); $('empty-state').hidden = true;
      $('load-error').hidden = false; $('results-status').textContent = '书目未载入';
    }
  }
  $('search-form').addEventListener('submit', event => {event.preventDefault(); render();});
  input.addEventListener('input', () => render());
  $('clear-search').addEventListener('click', () => {input.value = ''; render(); input.focus();});
  $('reset-search').addEventListener('click', () => {input.value = ''; filter = 'all'; render(); input.focus();});
  document.querySelectorAll('[data-filter]').forEach(button => button.addEventListener('click', () => {filter = button.dataset.filter; render();}));
  $('retry-load').addEventListener('click', load);
  addEventListener('popstate', () => {readState(); render(false);});
  readState(); load();
})();
