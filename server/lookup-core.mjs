// Portable query core. It needs fetch only and never receives account credentials.
const HAN = /[\u3400-\u9fff]/u;
const ENGLISH_EDITION = /英文(?:版|影印|原版)|英语版|english\s+(?:edition|version|reprint)|英文原著/iu;
const CHINESE_EDITION = /中文(?:版|译|稿)|汉译|漢譯|中译|中譯|简体|繁体|繁體/iu;
const ZLIB_BASES = new Set(['https://z-library.ec', 'https://z-library.sk', 'https://1lib.sk']);
export const CATALOG_URL = 'https://raw.githubusercontent.com/xhc144/algebraic-geometry-corpus/main/catalog.json';

export function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}
export function validateQuery(value) {
  const query = String(value || '').trim();
  if (query.length < 2 || query.length > 180 || /[\u0000-\u001f]/u.test(query)) throw new Error('invalid_query');
  return query;
}
export function chineseEvidence(book) {
  const title = String(book.title || book.name || '');
  if (ENGLISH_EDITION.test(title)) return 'no';
  const path = String(book.path || book.local_path || book.url || '');
  if (/(?:^|\/)zh(?:-cn|-hans|-hant)?\//i.test(path) || CHINESE_EDITION.test(title)) return 'yes';
  const language = String(book.language || '').trim().toLowerCase();
  if (/^(?:chinese|中文|汉语|漢語|zh(?:[-_](?:cn|tw|hans|hant))?)$/i.test(language)) return HAN.test(title) ? 'yes' : 'uncertain';
  if (language && !/unknown|unspecified/i.test(language)) return 'no';
  return 'uncertain';
}
export function recordMatches(book, query) {
  const codePattern=/\bgtm\s*[-.]?\s*0*(\d+)\b/giu;
  const codes=[...query.matchAll(codePattern)].map(match=>Number(match[1]));
  if(codes.length){
    const candidate=[book.series,book.id,book.title,...(book.aliases||[])].join(' ');
    const numbers=[...candidate.matchAll(codePattern)].map(match=>Number(match[1]));
    if(!codes.every(number=>numbers.includes(number)))return false;
  }
  const terms = query.replace(codePattern,' ').trim().split(/\s+/u).map(normalize).filter(Boolean);
  if(!terms.length)return codes.length>0;
  const haystack = normalize([book.title, book.name, book.originalTitle, book.author, ...(book.aliases || [])].join(' '));
  const title = normalize([book.title, book.name, book.originalTitle, ...(book.aliases || [])].join(' '));
  // An author-name collision by itself cannot establish this book's identity.
  return terms.every(term => haystack.includes(term)) && terms.some(term => title.includes(term));
}
function cleanText(value, max) {
  return String(value || '').replace(/<[^>]*>/g, '').replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);
}
export function publicItem(book) {
  const title = cleanText(book.title || book.name, 220)
    .replace(/[\s([【（]*(?:来源[：:]?\s*)?(?:z[-\s]?library|anna['’]?s?\s*archive|lib(?:rary)?\s*genesis|libgen)\b[\s\S]*$/iu,'')
    .replace(/[\s|—\-·:：([【（]+$/u,'').slice(0,170);
  const fromTitle = title.match(/第\s*([一二三四五六七八九十百\d]+)\s*版|\b(\d{1,2})(?:st|nd|rd|th)\s+ed(?:ition)?\b/iu);
  const rawEdition = cleanText(book.edition || fromTitle?.[0] || '', 32);
  const edition = /^(?:18|19|20)\d{2}$/.test(rawEdition) ? '' : rawEdition;
  const year = String(book.year || '').match(/\b(?:18|19|20)\d{2}\b/u)?.[0] || '';
  return {title, edition, year};
}
function uniqueItems(records) {
  const seen = new Set();
  return records.map(publicItem).filter(item => {
    const key = normalize(item.title) + '|' + item.edition + '|' + item.year;
    if (!item.title || seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 12);
}
export function classifyRecords(records, query) {
  const relevant = records.filter(book => recordMatches(book, query));
  return {
    confirmed: relevant.filter(book => chineseEvidence(book) === 'yes'),
    uncertain: relevant.filter(book => chineseEvidence(book) === 'uncertain'),
  };
}
export function catalogRecords(data) {
  const rows = [];
  for (const key of ['originals', 'official_zh', 'community_zh', 'native_zh', 'related_zh']) {
    for (const item of Array.isArray(data?.[key]) ? data[key] : []) {
      if (!/\.pdf$/i.test(String(item.path || ''))) continue;
      const meta = item.meta || {};
      const title = [meta.label || item.label || item.book || item.original, meta.zh || item.sub || item.zh, item.part].filter(Boolean).join(' · ') || item.path.split('/').pop().replace(/\.pdf$/i, '');
      rows.push({title, path: item.path, language: key.endsWith('_zh') ? 'Chinese' : '',
        author: item.author || item.by || meta.author || '', year: item.year || meta.year || '',
        aliases: [item.id, item.scope, item.desc, meta.fr, meta.series, '代数几何'].filter(Boolean), own: key === 'native_zh'});
    }
  }
  return rows;
}
function decodeHtml(value) {
  return String(value).replace(/<[^>]+>/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, entity => ({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '})[entity]).replace(/\s+/g, ' ').trim();
}
export function parseLibgen(html) {
  const rows = [];
  for (const row of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    if (!/[?&](?:amp;)?md5=[a-f\d]{32}/i.test(row[1])) continue;
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
    if (cells.length < 8) continue;
    const modern = [...cells[0].matchAll(/<a\b[^>]*href=["'][^"']*edition\.php[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)].map(match => decodeHtml(match[1])).find(title => title && !/^\d+$/.test(title));
    if (modern) rows.push({title: modern, author: decodeHtml(cells[1]), year: decodeHtml(cells[3]), language: decodeHtml(cells[4])});
    else if (cells.length >= 9) rows.push({title: decodeHtml(cells[2]), author: decodeHtml(cells[1]), year: decodeHtml(cells[4]), language: decodeHtml(cells[6])});
  }
  return rows;
}
export function parseAnna(html) {
  const rows = [];
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']\/md5\/[a-f\d]{32}["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = decodeHtml(match[1]);
    if (title) rows.push({title, language: '', author: '', year: ''});
  }
  return rows;
}
async function getResponse(fetchImpl, url, options, timeoutMs) {
  const controller=new AbortController();
  let timer;
  const deadline=new Promise((resolve,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('provider_timeout'));},timeoutMs);});
  try {
    const response = await Promise.race([fetchImpl(url, {...options, signal: controller.signal, redirect: 'manual'}),deadline]);
    if (!response.ok) throw new Error('provider_http_'+response.status);
    const length = Number(response.headers?.get?.('content-length') || 0);
    if (length > 8 * 1024 * 1024) throw new Error('provider_unavailable');
    const read=async method=>{try{return await Promise.race([response[method](),deadline]);}finally{clearTimeout(timer);}};
    return {json:()=>read('json'),text:()=>read('text')};
  } catch(error) {clearTimeout(timer);throw error;}
}
export async function searchAnonymousZLibrary(query, {fetchImpl=globalThis.fetch, timeoutMs=16000, zlibraryBase='https://z-library.ec'}={}) {
  if (!ZLIB_BASES.has(zlibraryBase)) throw new Error('invalid_provider');
  const body = new URLSearchParams({message: query, limit:'20', page:'1', 'languages[]':'chinese'});
  const response = await getResponse(fetchImpl, zlibraryBase + '/eapi/book/search', {method:'POST', body,
    headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'}}, timeoutMs);
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.books) || ![1,true].includes(payload.success)) throw new Error('provider_unavailable');
  return payload.books;
}
export async function lookupBook(rawQuery, {fetchImpl=globalThis.fetch, timeoutMs=16000, includeAlternates=true, ownBooks=[]}={}) {
  const query = validateQuery(rawQuery);
  const probes = [];
  async function probe(callback) {
    try {
      const records = await callback();
      const match = classifyRecords(records, query);
      const result = {ok:true, ...match}; probes.push(result); return result;
    } catch(error) { console.warn('Book provider request failed:',String(error?.name||'Error'),String(error?.message||'').replace(/https?:\S+/g,'[url]').slice(0,100)); const result = {ok:false, confirmed:[], uncertain:[]}; probes.push(result); return result; }
  }
  const own = ownBooks.filter(book => (book.translation || book.ownedChineseEdition) && recordMatches(book, query));
  const ownRows = own.map(book => ({...book, language:'Chinese', path:'zh-CN/owned.pdf', own:!!book.translation}));
  if(ownRows.some(book=>book.own))return {status:'found',items:uniqueItems(ownRows),own:true};
  const primary = await Promise.all([
    probe(() => searchAnonymousZLibrary(query, {fetchImpl, timeoutMs})),
    probe(async () => catalogRecords(await (await getResponse(fetchImpl, CATALOG_URL, {}, timeoutMs)).json())),
  ]);
  let confirmed = [...ownRows, ...primary.flatMap(result => result.confirmed)];
  if (!confirmed.length && includeAlternates) {
    await Promise.all([
      probe(async () => {
        const params = new URLSearchParams([['req',query],['res','25'],['topics[]','l'],['columns[]','t'],['columns[]','a']]);
        const html = await (await getResponse(fetchImpl, 'https://libgen.li/index.php?' + params, {}, timeoutMs)).text();
        const records = parseLibgen(html);
        if (!records.length && !/no (?:results|records|books)|0 (?:results|records|books)/i.test(html)) throw new Error('provider_unavailable');
        return records;
      }),
      probe(async () => {
        const html = await (await getResponse(fetchImpl, 'https://annas-archive.gl/search?q=' + encodeURIComponent(query), {}, timeoutMs)).text();
        const records = parseAnna(html);
        if (!records.length && !/no (?:results|records|books)|0 (?:results|records|books)/i.test(html)) throw new Error('provider_unavailable');
        return records;
      }),
    ]);
    confirmed = [...ownRows, ...probes.flatMap(result => result.confirmed)];
  }
  if (confirmed.length) return {status:'found', items:uniqueItems(confirmed), own:confirmed.some(book => book.own === true)};
  if (probes.some(result => result.uncertain.length)) return {status:'uncertain', items:uniqueItems(probes.flatMap(result => result.uncertain)), own:false};
  return {status:probes.every(result => result.ok) ? 'not_found' : 'unavailable', items:[], own:false};
}
