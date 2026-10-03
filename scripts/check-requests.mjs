// Финальная офлайн-проверка в браузере: открывает страницы (с прокруткой — срабатывают ленивые загрузки
// Mermaid, bpmn-js, Redoc, sql.js), записывает все сетевые запросы через DevTools Protocol
// и падает, если хоть один ушёл не на сам сайт. Дополняет статическую проверку scripts/check-offline.mjs.
// Нужен запущенный preview: npm run preview, затем npm run check:requests [-- --all]
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const base = (process.argv.find((a) => a.startsWith('--base='))?.slice(7) ?? 'http://localhost:4321').replace(/\/$/, '');
const origin = new URL(base).origin;
const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
if (!chromePath) {
  console.warn('[requests] Chrome не найден (CHROME_PATH) — проверка пропущена');
  process.exit(0);
}

const pages = [];
(function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (n === 'index.html') pages.push(('/' + relative(resolve('dist'), dir).replaceAll('\\', '/') + '/').replace('//', '/'));
  }
})(resolve('dist'));
const sample = ['/', '/processes/bpmn/', '/diagrams/sequence/', '/case/', '/case/01-business/to-be/', '/case/04-integrations/api-idm/', '/case/04-integrations/api-hr-events/', '/case/diagrams/', '/glossary/', ...pages.filter((p) => p.startsWith('/tools/'))];
const targets = process.argv.includes('--all') ? pages : sample;

const port = 9900 + Math.floor(Math.random() * 90);
const profile = mkdtempSync(join(tmpdir(), 'sa-req-'));
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-component-update', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, 'about:blank'], { stdio: 'ignore' });
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
const external = new Map();
let current = '';
let total = 0;
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) (pending.get(m.id)(m.result), pending.delete(m.id));
  if (m.method === 'Network.requestWillBeSent') {
    const url = m.params.request.url;
    total++;
    if (/^(data|blob|about|chrome-extension):/.test(url)) return;
    if (new URL(url).origin !== origin) external.set(url, current);
  }
});
const send = (method, params = {}) => new Promise((r) => (pending.set(++seq, r), ws.send(JSON.stringify({ id: seq, method, params }))));

await send('Network.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
for (const path of targets) {
  current = path;
  await send('Page.navigate', { url: base + path });
  await sleep(1500);
  // прокрутка до конца и обратно: ленивые диаграммы, просмотрщики, острова client:visible
  await send('Runtime.evaluate', { expression: 'window.scrollTo(0, document.body.scrollHeight)' });
  await sleep(1500);
  await send('Runtime.evaluate', { expression: 'document.querySelectorAll("details").forEach(d => d.open = true); window.scrollTo(0, 0)' });
  // --selftest: заведомо внешний запрос — проверка обязана его поймать
  if (process.argv.includes('--selftest') && path === targets[0]) await send('Runtime.evaluate', { expression: 'fetch("https://example.invalid/selftest").catch(() => {})' });
  await sleep(1000);
  process.stdout.write('.');
}
ws.close();
chrome.kill();
await sleep(500);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {}

console.log(`\n[requests] страниц: ${targets.length}, запросов: ${total}`);
if (external.size) {
  for (const [url, page] of external) console.error(`  ✗ ${page} → ${url}`);
  console.error(`[requests] внешних запросов: ${external.size}`);
  process.exit(1);
}
console.log('[requests] все запросы — к самому сайту ✓');
