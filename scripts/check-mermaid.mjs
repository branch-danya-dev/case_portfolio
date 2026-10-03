// Автопроверка всех Mermaid-диаграмм сайта: берёт исходники из собранного dist/ (div.mermaid-code)
// и стартовые примеры песочницы, отрисовывает каждую в headless Chrome локальной копией mermaid.
// Сеть не нужна. Запуск после сборки: npm run check:mermaid
// Chrome ищется в стандартных путях Windows / macOS / Linux или берётся из CHROME_PATH.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const DIST = resolve('dist');
if (!existsSync(DIST)) {
  console.error('[mermaid] нет dist/ — сначала npm run build');
  process.exit(1);
}

const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => p && existsSync(p));
if (!chrome) {
  console.warn('[mermaid] Chrome не найден — проверка пропущена (укажите CHROME_PATH)');
  process.exit(0);
}

// ---------- собрать диаграммы ----------
const unescape = (s) => s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.html')) htmlFiles.push(p);
  }
})(DIST);

const items = [];
for (const file of htmlFiles) {
  const html = readFileSync(file, 'utf8');
  const page = '/' + relative(DIST, file).replaceAll('\\', '/').replace(/index\.html$/, '');
  let n = 0;
  for (const m of html.matchAll(/<div class="mermaid-code"[^>]*>([\s\S]*?)<\/div>/g)) {
    items.push({ where: `${page} #${++n}`, code: unescape(m[1]) });
  }
}
const starters = await build({ entryPoints: ['src/data/mermaid-starters.ts'], bundle: true, write: false, format: 'esm' });
const { starters: list } = await import('data:text/javascript;base64,' + Buffer.from(starters.outputFiles[0].text).toString('base64'));
for (const s of list) items.push({ where: `песочница: ${s.id}`, code: s.code });
// --extra=<папка>: дополнительно проверить файлы *.mmd из папки (например, фрагменты для шпаргалки)
const extra = process.argv.find((a) => a.startsWith('--extra='))?.slice(8);
if (extra) for (const f of readdirSync(extra).filter((n) => n.endsWith('.mmd'))) items.push({ where: `extra: ${f}`, code: readFileSync(join(extra, f), 'utf8') });
// Самопроверка: --selftest добавляет заведомо битую диаграмму — проверка обязана её поймать.
const selftest = process.argv.includes('--selftest');
if (selftest) items.push({ where: 'selftest', code: 'flowchart TD\n  A --> B -->' });

// ---------- страница проверки ----------
const dir = mkdtempSync(join(tmpdir(), 'sa-mermaid-'));
const page = join(dir, 'check.html');
writeFileSync(
  page,
  `<!doctype html><meta charset="utf-8"><body>
<div id="stage" style="width:1200px"></div><pre id="out">PENDING</pre>
<script src="${pathToFileURL(resolve('node_modules/mermaid/dist/mermaid.min.js'))}"></script>
<script>
const items = ${JSON.stringify(items).replaceAll('</', '<\\/')};
(async () => {
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
  const res = [];
  for (const [i, it] of items.entries()) {
    try {
      await mermaid.parse(it.code);
      const { svg } = await mermaid.render('d' + i, it.code);
      res.push({ where: it.where, ok: svg.includes('<svg') });
    } catch (e) {
      res.push({ where: it.where, ok: false, error: String(e && e.message || e).split('\\n').slice(0, 3).join(' ') });
    }
  }
  document.getElementById('out').textContent = 'RESULT' + JSON.stringify(res);
})();
</script>`,
);

let dom = '';
try {
  dom = execFileSync(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${join(dir, 'profile')}`, '--allow-file-access-from-files', '--virtual-time-budget=120000', '--dump-dom', pathToFileURL(page).href], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 180000,
    stdio: ['ignore', 'pipe', 'ignore'], // отдельный временный профиль; служебный вывод Chrome не нужен
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

const m = dom.match(/RESULT(\[[\s\S]*?\])<\/pre>/);
if (!m) {
  console.error('[mermaid] проверка не завершилась (нет результата в DOM)');
  process.exit(1);
}
const results = JSON.parse(unescape(m[1]));
const bad = results.filter((r) => !r.ok);
for (const r of bad) console.error(`  ✗ ${r.where}: ${r.error ?? 'пустой SVG'}`);
console.log(`[mermaid] диаграмм: ${results.length}, с ошибками: ${bad.length}${bad.length ? '' : ' ✓'}`);
if (selftest) {
  const caught = bad.some((r) => r.where === 'selftest');
  console.log(caught ? '[mermaid] самопроверка: битая диаграмма поймана ✓' : '[mermaid] самопроверка НЕ прошла: битая диаграмма не поймана');
  process.exit(caught && bad.length === 1 ? 0 : 1);
}
process.exit(bad.length ? 1 : 0);
