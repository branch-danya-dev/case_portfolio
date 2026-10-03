// Проверка доступности (axe-core, правила WCAG 2.x A/AA) на выборке страниц в тёмной и светлой теме.
// Нужен запущенный preview: npm run preview, затем npm run check:a11y [-- --all] [-- --base=http://localhost:4321]
// Chrome управляется через DevTools Protocol, профиль — временный. Сеть наружу не нужна.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const base = (process.argv.find((a) => a.startsWith('--base='))?.slice(7) ?? 'http://localhost:4321').replace(/\/$/, '');
const all = process.argv.includes('--all');
// --detail=<правило>: подробности по элементам (для color-contrast — цвета и отношение)
const detail = process.argv.find((a) => a.startsWith('--detail='))?.slice(9);
const details = new Map();
const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
if (!chromePath) {
  console.warn('[a11y] Chrome не найден (CHROME_PATH) — проверка пропущена');
  process.exit(0);
}
try {
  await fetch(base);
} catch {
  console.error(`[a11y] ${base} не отвечает — запустите npm run preview`);
  process.exit(1);
}

// Страницы: все из dist/ (--all) или по одной каждого типа
const pages = [];
(function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n === 'index.html') pages.push('/' + relative(resolve('dist'), dir).replaceAll('\\', '/') + (dir === resolve('dist') ? '' : '/'));
  }
})(resolve('dist'));
const SAMPLE = [
  '/', '/start/knowledge-map/', '/processes/bpmn/', '/requirements/prioritization/', '/diagrams/sequence/', '/diagram-howto/sequence/',
  '/data/sql-joins-aggregates/', '/integrations/rest-design/', '/architecture/adr/', '/testing/test-design/', '/software/api/',
  '/interview/', '/interview/questions/integrations/', '/interview/tasks/sql/', '/glossary/', '/cheatsheets/data/',
  '/case/', '/case/02-requirements/functional-requirements/', '/case/04-integrations/api-idm/', '/case/diagrams/',
  ...pages.filter((p) => p.startsWith('/tools/')),
];
// --pages=/a/,/b/ — только эти страницы
const only = process.argv.find((a) => a.startsWith('--pages='))?.slice(8).split(',');
const targets = only ?? (all ? pages : SAMPLE.filter((p) => pages.includes(p) || p === '/')).map((p) => p.replace('//', '/'));

const port = 9600 + Math.floor(Math.random() * 300);
const profile = mkdtempSync(join(tmpdir(), 'sa-a11y-'));
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) (pending.get(m.id)(m.result ?? { error: m.error }), pending.delete(m.id));
});
const send = (method, params = {}) => new Promise((r) => (pending.set(++seq, r), ws.send(JSON.stringify({ id: seq, method, params }))));
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

const axeSource = readFileSync(resolve('node_modules/axe-core/axe.min.js'), 'utf8');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

const byRule = new Map();
for (const theme of ['dark', 'light']) {
  for (const path of targets) {
    await send('Page.navigate', { url: base + path });
    await sleep(1200);
    // Тема — как её выставляет переключатель Starlight
    await evaluate(`localStorage.setItem('starlight-theme', '${theme}'); localStorage.setItem('sa:theme-default-applied','1'); document.documentElement.dataset.theme='${theme}'; true`);
    await sleep(1500);
    await evaluate(axeSource + ';true');
    const res = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] }, resultTypes: ['violations'] })
      .then(r => JSON.stringify(r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 3).map(n => n.target.join(' ')), count: v.nodes.length, all: v.nodes.map(n => ({ t: n.target.join(' ').replace(/\[uid="[^"]*"\]/g, ''), d: n.any[0] && n.any[0].data })) }))))`);
    for (const v of JSON.parse(res ?? '[]')) {
      const e = byRule.get(v.id) ?? { ...v, pages: [], total: 0 };
      e.pages.push(`${theme} ${path}`);
      e.total += v.count;
      byRule.set(v.id, e);
      if (detail === v.id) for (const n of v.all) {
        const d = n.d ?? {};
        const key = `${theme} ${n.t.split(' > ').slice(-2).join(' > ')} fg=${d.fgColor} bg=${d.bgColor} ${d.contrastRatio}`;
        details.set(key, (details.get(key) ?? 0) + 1);
      }
    }
    process.stdout.write('.');
  }
}
ws.close();
chrome.kill();
await sleep(500);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {}

if (detail) for (const [k, n] of [...details].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${k}`);
console.log(`\n[a11y] страниц: ${targets.length} × 2 темы`);
if (!byRule.size) {
  console.log('[a11y] нарушений не найдено ✓');
  process.exit(0);
}
for (const v of [...byRule.values()].sort((a, b) => b.total - a.total)) {
  console.log(`\n✗ ${v.id} (${v.impact}) — ${v.help}: ${v.total} элем. на ${v.pages.length} стр.`);
  console.log(`  страницы: ${v.pages.slice(0, 6).join(', ')}${v.pages.length > 6 ? '…' : ''}`);
  console.log(`  примеры: ${v.nodes.join(' | ')}`);
}
process.exit(1);
