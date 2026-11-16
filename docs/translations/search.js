'use strict';
(function (root) {
  function normalize(text) {
    return String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
      .replace(/傅立叶/g, '傅里叶').replace(/拓樸/g, '拓扑').replace(/幾何/g, '几何')
      .replace(/線性/g, '线性').replace(/導論/g, '导论').replace(/\bgtm\s*[-.]?\s*0*(\d+)/g, 'gtm$1')
      .replace(/[^\p{L}\p{N}]/gu, '');
  }
  function matches(book, query, filter) {
    if (filter === 'mine' && !book.translation) return false;
    if (filter === 'chinese' && !book.chineseEdition && !book.ownedChineseEdition) return false;
    const codePattern = /\bgtm\s*[-.]?\s*0*(\d+)\b/gi;
    const queryText = String(query);
    const codes = [...queryText.matchAll(codePattern)];
    if (codes.some(match => normalize(book.series) !== 'gtm' + Number(match[1]))) return false;
    const haystack = normalize([book.title, book.originalTitle, book.author, book.series, ...(book.aliases || [])].join(' '));
    return queryText.replace(codePattern, ' ').trim().split(/\s+/).filter(Boolean).every(term => haystack.includes(normalize(term)));
  }
  const api = {normalize, matches};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.translationSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
