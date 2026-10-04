// Проверка API Lab: каждое задание не решается стартовым запросом и решается эталонным решением.
// Задания проходятся подряд на одном учебном сервере (как у пользователя), часы подменяются.
// Запуск: node scripts/check-api-lab.mjs (входит в npm run build).
import { build } from 'esbuild';

const bundled = await build({
  stdin: {
    contents: `export * from './src/lib/api-lab/http.ts'; export * from './src/lib/api-lab/mock.ts'; export * from './src/lib/api-lab/exercises.ts';`,
    resolveDir: '.',
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
});
const lab = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const { MockApi, LAB_EXERCISES, parseCurl, parseRaw, TOKEN, PAY_TOKEN, ORDER } = lab;

let now = Date.UTC(2027, 5, 14, 6, 0, 0);
const api = new MockApi(() => now);
const vars = { [TOKEN]: '', [PAY_TOKEN]: '', [ORDER]: '' };
const problems = [];

const send = (mode, text) => {
  for (const [k, v] of Object.entries(vars)) text = text.split(k).join(v);
  const p = mode === 'curl' ? parseCurl(text) : parseRaw(text);
  if (!p.ok) throw new Error(`не разобран запрос: ${p.error}\n${text}`);
  now += 500;
  const ex = api.handle(p.req);
  // запоминаем токены и заказ, как это сделал бы пользователь
  try {
    const b = JSON.parse(ex.res.body);
    if (ex.route === 'POST /auth/token' && b.access_token) vars[b.access_token.startsWith('tok_payments') ? PAY_TOKEN : TOKEN] = b.access_token;
    if (ex.route === 'POST /orders' && b.orderId) vars[ORDER] = b.orderId;
  } catch {}
  return ex;
};

// Особые сценарии с ожиданием — шаги вручную
const special = {
  'rate-limit': () => {
    const pay = () => send('curl', `curl -X POST https://api.lab.local/payments -H "Authorization: Bearer ${vars[PAY_TOKEN]}" --json '{"orderId":"${vars[ORDER]}","amount":100}'`);
    let ex = pay();
    for (let i = 0; i < 5 && ex.res.status !== 429; i++) ex = pay();
    if (ex.res.status !== 429) throw new Error('429 не получен');
    const wait = Number(ex.res.headers.find(([n]) => n === 'Retry-After')[1]) * 1000;
    now += 200;
    if (pay().res.status !== 429) throw new Error('повтор раньше Retry-After не дал 429');
    if (LAB_EXERCISES.find((e) => e.id === 'rate-limit').check(api.log)) throw new Error('засчитано до ожидания');
    now += wait;
    const done = pay();
    if (done.res.status !== 201) throw new Error(`после ожидания: ${done.res.status}`);
  },
  unavailable: () => {
    const get = () => send('curl', `curl https://api.lab.local/exchange-rates -H "Authorization: Bearer ${vars[TOKEN]}"`);
    const first = get();
    if (first.res.status !== 503) throw new Error(`ожидался 503, получен ${first.res.status}`);
    const wait = Number(first.res.headers.find(([n]) => n === 'Retry-After')[1]) * 1000;
    if (get().res.status !== 503) throw new Error('повтор сразу не дал 503');
    now += wait;
    if (get().res.status !== 200) throw new Error('после ожидания нет 200');
  },
  timeout: () => {
    const sync = send('curl', `curl https://api.lab.local/reports/daily-sync -H "Authorization: Bearer ${vars[TOKEN]}"`);
    if (!sync.res.timeout) throw new Error('синхронный отчёт не дал тайм-аут');
    const created = send('curl', `curl -X POST https://api.lab.local/reports -H "Authorization: Bearer ${vars[TOKEN]}" --json '{"type":"daily"}'`);
    if (created.res.status !== 202) throw new Error(`POST /reports: ${created.res.status}`);
    const loc = created.res.headers.find(([n]) => n === 'Location')[1];
    const early = send('curl', `curl https://api.lab.local${loc} -H "Authorization: Bearer ${vars[TOKEN]}"`);
    if (JSON.parse(early.res.body).status !== 'processing') throw new Error('отчёт готов слишком рано');
    now += 4000;
    send('curl', `curl https://api.lab.local${loc} -H "Authorization: Bearer ${vars[TOKEN]}"`);
  },
};

for (const ex of LAB_EXERCISES) {
  try {
    const start = ex.mode === 'curl' ? parseCurl(ex.start) : parseRaw(ex.start);
    if (!start.ok) throw new Error(`стартовый запрос не разбирается: ${start.error}`);
    const before = api.log.length;
    send(ex.mode, ex.start.replaceAll('<ваш токен>', vars[TOKEN] || 'x').replaceAll('<токен lab-client>', vars[TOKEN] || 'x').replaceAll('<токен payments-client>', vars[PAY_TOKEN] || 'x').replaceAll('<orderId>', vars[ORDER] || 'x'));
    const startRes = api.log[before].res;
    if (ex.check(api.log)) throw new Error('стартовый запрос уже решает задание');
    if (special[ex.id]) special[ex.id]();
    else for (const s of ex.solution) send(ex.mode, s);
    if (!ex.check(api.log)) throw new Error('эталонное решение не решает задание');
    console.log(`ok  ${ex.id.padEnd(14)} старт → ${startRes.timeout ? 'тайм-аут' : startRes.status}`);
  } catch (e) {
    problems.push(ex.id);
    console.log(`ОШИБКА ${ex.id}: ${e.message}`);
  }
}

// разбор curl: многострочный ввод, кавычки, -d без Content-Type
const c = parseCurl(`curl -X POST \\\n  http://localhost:4321/api/users \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: test-001" \\\n  -d '{"login":"IVANOV"}'`);
if (!c.ok || c.req.method !== 'POST' || c.req.headers.length !== 2 || c.req.body !== '{"login":"IVANOV"}') {
  problems.push('parseCurl');
  console.log('ОШИБКА parseCurl', JSON.stringify(c));
}

// мок по контракту
{
  const cm = await build({
    stdin: { contents: `export * from './src/lib/api-lab/contract-mock.ts'; export * from './src/lib/api-lab/http.ts';`, resolveDir: '.', loader: 'ts' },
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
  });
  const { ContractMock, STARTER_CONTRACT, parseRaw: raw } = await import('data:text/javascript;base64,' + Buffer.from(cm.outputFiles[0].text).toString('base64'));
  const YAML = (await import('yaml')).default;
  const mock = new ContractMock(YAML.parse(STARTER_CONTRACT));
  const call = (t) => mock.handle(raw(t).req);
  const good = '{"employeeNumber":"004318","items":[{"entitlementId":"VPN"}],"justification":"Работа из дома по графику"}';
  const cases = [
    ['без Idempotency-Key → 400', `POST /v1/access-requests HTTP/1.1\nContent-Type: application/json\n\n${good}`, 400],
    ['text/plain → 415', `POST /v1/access-requests HTTP/1.1\nIdempotency-Key: k1\nContent-Type: text/plain\n\n${good}`, 415],
    ['схема → 400', `POST /v1/access-requests HTTP/1.1\nIdempotency-Key: k1\nContent-Type: application/json\n\n{"employeeNumber":"43","items":[]}`, 400],
    ['корректно → 201', `POST /v1/access-requests HTTP/1.1\nIdempotency-Key: k1\nContent-Type: application/json\n\n${good}`, 201],
    ['Prefer: code=422 → 422', `POST /v1/access-requests HTTP/1.1\nIdempotency-Key: k1\nPrefer: code=422\nContent-Type: application/json\n\n${good}`, 422],
    ['GET по шаблону → 200', `GET /v1/access-requests/9a1e7c3b-2d44-4f0a-8e61-5b3c7d2a9e01 HTTP/1.1\n`, 200],
    ['нет пути → 404', `GET /v1/orders HTTP/1.1\n`, 404],
    ['нет метода → 405', `DELETE /v1/access-requests HTTP/1.1\n`, 405],
  ];
  for (const [name, t, want] of cases) {
    const r = call(t);
    if (r.status !== want) {
      problems.push(`contract: ${name}`);
      console.log(`ОШИБКА contract ${name}: получено ${r.status}\n${r.body}`);
    } else console.log(`ok  contract ${name}${want === 400 && name.startsWith('схема') ? ' · ' + JSON.parse(r.body).errors.map((e) => e.message).join('; ') : ''}`);
  }
}

if (problems.length) {
  console.error(`[api-lab] проблемы: ${problems.join(', ')}`);
  process.exit(1);
}
console.log(`[api-lab] все ${LAB_EXERCISES.length} заданий решаемы, старт не засчитывается ✓`);
