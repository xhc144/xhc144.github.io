import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// 共用同源绝对地址：任何项目路径均使用主站的同一密码和会话。
export const GATE_TAGS = '<link rel="stylesheet" href="/access-gate.css?v=20261116-1" data-access-gate>\n<script src="/access-gate.js?v=20261116-1" data-access-gate></script>';
const NO_SCRIPT = '<noscript><p>请启用 JavaScript 并输入访问密码后浏览。</p></noscript>';
export function protectHtml(source) {
  if (source.includes('data-access-gate')) return source;
  // 第一时间隐藏内容。保留字符集声明在最前，拦截早于跳转和其他脚本。
  const charset = /<meta\s+charset\s*=\s*["']?[^>]+>/i;
  let result = charset.test(source)
    ? source.replace(charset, match => match + '\n' + GATE_TAGS)
    : /<head(?:\s[^>]*)?>/i.test(source)
      ? source.replace(/<head(?:\s[^>]*)?>/i, match => match + '\n' + GATE_TAGS)
      : GATE_TAGS + '\n' + source;
  result = result.replace(/<body(?:\s[^>]*)?>/i, match => match + '\n' + NO_SCRIPT);
  return result;
}
export function protectDirectory(directory, check = false) {
  let count = 0;
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (entry.isSymbolicLink() || ['.git', 'node_modules', '.ai-handoff'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { count += protectDirectory(file, check); continue; }
    if (!/\.html?$/i.test(entry.name)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const next = protectHtml(source);
    if (check && next !== source) throw new Error('Missing password gate: ' + file);
    if (!check && next !== source) fs.writeFileSync(file, next);
    count++;
  }
  return count;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const directory = args.find(arg => !arg.startsWith('--')) || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
  console.log(`${args.includes('--check') ? 'Checked' : 'Protected'} ${protectDirectory(directory, args.includes('--check'))} HTML pages`);
}
