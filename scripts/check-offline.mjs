// Проверяет, что собранный сайт не загружает ничего из сети.
// Ошибка — внешний адрес в местах, откуда браузер реально загружает ресурс:
//   HTML: src=, srcset=, <link href> (кроме rel=canonical/alternate/sitemap), <object data>
//   CSS:  url(http…), @import http…
//   JS:   обращения к известным CDN и сервисам шрифтов
// Обычные гиперссылки <a href="https://…"> разрешены: это переходы, а не запросы.
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const DIST = resolve('dist');
const EXTERNAL = /^(https?:)?\/\//i;
const CDN_HOSTS =
  /(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|esm\.sh|cdn\.skypack\.dev|use\.typekit\.net|validator\.swagger\.io|cdn\.redoc\.ly)/i;

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return files.flat();
}

const issues = [];
const report = (file, what) => issues.push(`${relative(DIST, file)}: ${what}`);

for (const file of await walk(DIST)) {
  const ext = extname(file);
  if (!['.html', '.css', '.js', '.mjs'].includes(ext)) continue;
  // Исходники кейса копируются как есть и браузером не исполняются.
  if (relative(DIST, file).startsWith('case-files')) continue;
  const text = await readFile(file, 'utf8');

  if (ext === '.html') {
    for (const m of text.matchAll(/\s(?:src|data)\s*=\s*["']([^"']+)["']/gi)) {
      if (EXTERNAL.test(m[1])) report(file, `внешний src/data: ${m[1]}`);
    }
    for (const m of text.matchAll(/\ssrcset\s*=\s*["']([^"']+)["']/gi)) {
      if (/(^|,\s*)(https?:)?\/\//i.test(m[1])) report(file, `внешний srcset: ${m[1]}`);
    }
    for (const m of text.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0];
      const href = tag.match(/\shref\s*=\s*["']([^"']+)["']/i)?.[1];
      const rel = tag.match(/\srel\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
      if (href && EXTERNAL.test(href) && !/canonical|alternate|sitemap/i.test(rel)) {
        report(file, `внешний <link>: ${href}`);
      }
    }
  }
  if (ext === '.css' || ext === '.html') {
    for (const m of text.matchAll(/url\(\s*["']?((?:https?:)?\/\/[^"')]+)/gi)) {
      report(file, `внешний url(): ${m[1]}`);
    }
    for (const m of text.matchAll(/@import\s+(?:url\()?\s*["']?((?:https?:)?\/\/[^"')\s;]+)/gi)) {
      report(file, `внешний @import: ${m[1]}`);
    }
  }
  if (ext === '.js' || ext === '.mjs' || ext === '.html') {
    const m = text.match(CDN_HOSTS);
    if (m) report(file, `обращение к CDN/внешнему сервису: ${m[0]}`);
  }
}

if (issues.length) {
  console.error(`[offline] найдено внешних загрузок: ${issues.length}`);
  for (const i of issues) console.error(`  ✗ ${i}`);
  process.exit(1);
}
console.log('[offline] внешних загрузок не найдено ✓');
