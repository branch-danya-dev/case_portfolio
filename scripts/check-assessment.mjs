// Self-test аттестации: алгоритм выборки и подсчёта баллов (на синтетическом банке) и контент экзаменов
// (эталоны SQL, HTTP, JSON Schema, OpenAPI проходят собственные проверки). Запуск: node scripts/check-assessment.mjs
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const entry = `
export * from './src/lib/assessment/select.ts';
export * from './src/lib/assessment/score.ts';
export * from './src/lib/assessment/rng.ts';
export * from './src/lib/assessment/validators.ts';
export { MockApi } from './src/lib/api-lab/mock.ts';
export { parseCurl } from './src/lib/api-lab/http.ts';
${existsSync('src/data/assessment/index.ts') ? "export * as content from './src/data/assessment/index.ts';" : 'export const content = null;'}
`;
// Пакеты из node_modules не бандлим (ajv — CommonJS): бандл кладём внутрь проекта, чтобы импорты разрешились.
const out = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', packages: 'external', logLevel: 'error' });
mkdirSync('node_modules/.cache', { recursive: true });
const bundlePath = 'node_modules/.cache/check-assessment.bundle.mjs';
writeFileSync(bundlePath, out.outputFiles[0].text);
const M = await import(pathToFileURL(bundlePath).href);

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) {
    failed++;
    console.log('ОШИБКА ' + msg);
  }
};
const near = (a, b) => Math.abs(a - b) < 1e-9;

// ---------- A. Алгоритм на синтетическом банке ----------
const COMPS = ['requirements', 'data', 'integrations', 'testing'];
const bank = [];
for (const c of COMPS)
  for (let i = 0; i < 6; i++)
    bank.push({ id: `${c}-${i}`, kind: 'theory', exams: ['foundation'], competency: c, difficulty: 1 + (i % 3), weight: 1 + (i % 2), type: 'single', options: ['a', 'b', 'c'], answer: i % 3, prompt: '', explanation: '', refs: [] });
bank.push({ id: 'p-order', kind: 'practice', exams: ['foundation'], competency: 'processes', difficulty: 2, weight: 3, type: 'order', steps: ['1', '2', '3', '4'], prompt: '', explanation: '', refs: [] });
bank.push({ id: 'p-text', kind: 'practice', exams: ['foundation'], competency: 'requirements', difficulty: 2, weight: 2, type: 'text', rubric: ['a', 'b', 'c', 'd'], reference: '', prompt: '', explanation: '', refs: [] });
const exam = {
  id: 'foundation',
  title: 't',
  short: 't',
  description: '',
  pass: 70,
  sections: [
    { id: 'theory', kind: 'theory', title: 'Т', share: 60, pick: COMPS.map((c) => ({ competency: c, count: 3 })) },
    { id: 'practice', kind: 'practice', title: 'П', share: 40, fixed: ['p-order', 'p-text'] },
  ],
};
const byId = (id) => bank.find((b) => b.id === id);

for (let s = 1; s <= 2000; s++) {
  const plan = M.buildPlan(exam, bank, [], s * 7919);
  const ids = plan.sections.flatMap((x) => x.items);
  ok(new Set(ids).size === ids.length, `seed ${s}: повтор задания`);
  for (const c of COMPS) ok(plan.sections[0].items.filter((id) => byId(id).competency === c).length === 3, `seed ${s}: компетенция ${c} покрыта не полностью`);
}
const plan = M.buildPlan(exam, bank, [], 42);
ok(JSON.stringify(plan) === JSON.stringify(M.buildPlan(exam, bank, [], 42)), 'один seed — разные попытки');

// Нехватка пула — ошибка схемы, а не тихий недобор
let threw = false;
try {
  M.buildPlan({ ...exam, sections: [{ ...exam.sections[0], pick: [{ competency: 'data', count: 7 }] }] }, bank, [], 1);
} catch (e) {
  threw = e instanceof M.BlueprintError;
}
ok(threw, 'недобор пула не обнаружен');

// Идеальные ответы → 100%, пустые → 0%, с самопроверкой текстов
const perfect = {};
for (const id of plan.sections.flatMap((x) => x.items)) {
  const it = byId(id);
  if (it.type === 'single') perfect[id] = { t: 'single', v: it.answer };
  if (it.type === 'order') perfect[id] = { t: 'order', v: [0, 1, 2, 3] };
  if (it.type === 'text') perfect[id] = { t: 'text', v: 'ответ' };
}
const marksAll = { 'p-text': [true, true, true, true] };
const full = M.aggregate(exam, plan, byId, perfect, {}, marksAll);
ok(near(full.total, 1) && !full.pending, `идеальные ответы дают ${full.total}`);
const empty = M.aggregate(exam, plan, byId, {}, {}, {});
ok(near(empty.total, 0), `пустые ответы дают ${empty.total}`);
const noMarks = M.aggregate(exam, plan, byId, perfect, {}, {});
ok(noMarks.pending, 'текст без самопроверки не помечен как предварительный');

// Сумма весов и доли: раздел из теории с половиной верных
const half = { ...perfect };
const theoryIds = plan.sections[0].items;
theoryIds.slice(0, 6).forEach((id) => (half[id] = { t: 'single', v: (byId(id).answer + 1) % 3 }));
const r = M.aggregate(exam, plan, byId, half, {}, marksAll);
const tw = theoryIds.reduce((t, id) => t + byId(id).weight, 0);
const lost = theoryIds.slice(0, 6).reduce((t, id) => t + byId(id).weight, 0);
ok(near(r.sections[0].score, (tw - lost) / tw), 'балл раздела не равен взвешенному среднему');
ok(near(r.total, (0.6 * (tw - lost)) / tw + 0.4), 'итог не равен сумме долей');

// Независимость от порядка заданий
const shuffled = { ...plan, sections: plan.sections.map((s) => ({ ...s, items: [...s.items].reverse() })) };
const r2 = M.aggregate(exam, shuffled, byId, half, {}, marksAll);
ok(near(r.total, r2.total), 'итог зависит от порядка заданий');
ok(r.competencies.every((c) => near(c.score, r2.competencies.find((x) => x.id === c.id).score)), 'компетенции зависят от порядка');

// Частичные баллы
ok(near(M.orderScore([0, 1, 3, 2], 4), 1 / 3), 'порядок: частичный балл');
ok(near(M.scoreItem({ type: 'multiple', answer: [0, 2] }, { t: 'multiple', v: [0, 1] }), 0), 'множественный выбор: штраф за неверный');
ok(near(M.scoreItem({ type: 'multiple', answer: [0, 2] }, { t: 'multiple', v: [0] }), 0.5), 'множественный выбор: частичный');
ok(near(M.scoreItem({ type: 'match', pairs: [1, 2, 3, 4] }, { t: 'match', v: [0, 1, 3, 2] }), 0.5), 'сопоставление: частичный');
ok(M.band(0.93).label === M.BANDS[0].label && M.band(0.599).label === M.BANDS[4].label && M.band(0.6).label === M.BANDS[3].label, 'границы интерпретации');
ok(M.permutation(5, 'x', 4).some((v, i) => v !== i), 'перестановка совпала с правильным порядком');

console.log(failed ? '' : '[assessment] алгоритм: 2000 выборок, баллы, доли, порядок, крайние случаи ✓');

// ---------- B. Контент экзаменов ----------
if (M.content) {
  const C = M.content;
  failed += await checkContent(C);
}

async function checkContent(C) {
  let bad = 0;
  const fail = (m) => {
    bad++;
    console.log('ОШИБКА ' + m);
  };
  const all = C.ALL_ITEMS;
  const ids = all.map((i) => i.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) fail(`повторяющиеся id: ${dup.join(', ')}`);
  const comps = new Set(C.COMPETENCIES.map((c) => c.id));
  const docs = new Set(C.DOC_SLUGS);
  for (const it of all) {
    if (!comps.has(it.competency)) fail(`${it.id}: неизвестная компетенция ${it.competency}`);
    if (!it.explanation?.trim()) fail(`${it.id}: нет разбора`);
    if (!it.refs?.length) fail(`${it.id}: нет ссылок для повторения`);
    for (const r of it.refs ?? []) if (!docs.has(r)) fail(`${it.id}: ссылка на несуществующую страницу ${r}`);
    if (it.type === 'single' && !(it.answer >= 0 && it.answer < it.options.length)) fail(`${it.id}: answer вне вариантов`);
    if (it.type === 'multiple' && (!it.answer.length || it.answer.some((a) => a < 0 || a >= it.options.length))) fail(`${it.id}: answer вне вариантов`);
    if ((it.type === 'single' || it.type === 'multiple') && new Set(it.options).size !== it.options.length) fail(`${it.id}: одинаковые варианты`);
    if (it.type === 'order' && it.steps.length < 3) fail(`${it.id}: в порядке меньше 3 шагов`);
    if (it.type === 'match' && new Set(it.pairs.map((p) => p.right)).size !== it.pairs.length) fail(`${it.id}: одинаковые правые части`);
    if (it.type === 'text' && it.rubric.length < 3) fail(`${it.id}: рубрика короче 3 пунктов`);
  }
  for (const c of C.CASES) for (const it of c.items) for (const m of it.materials ?? []) if (!c.materials.some((x) => x.id === m)) fail(`${it.id}: нет материала ${m}`);

  // Схемы экзаменов собираются для 2000 seed, обязательные компетенции покрыты
  for (const exam of C.EXAMS) {
    for (let s = 1; s <= 2000; s++) {
      let p;
      try {
        p = M.buildPlan(exam, all, C.CASES, s * 104729);
      } catch (e) {
        fail(`${exam.id}: ${e.message}`);
        break;
      }
      for (const sec of exam.sections)
        for (const rule of sec.pick ?? []) {
          const got = p.sections.find((x) => x.id === sec.id).items.filter((id) => C.itemById(id).competency === rule.competency).length;
          if (got < rule.count) fail(`${exam.id}: seed ${s}: ${rule.competency} — ${got} из ${rule.count}`);
        }
    }
    const shares = exam.sections.reduce((t, s) => t + s.share, 0);
    if (shares !== 100) fail(`${exam.id}: доли разделов в сумме ${shares}`);
  }

  // Эталоны практики проходят собственные проверки
  const dbSql = { idm: readFileSync('src/data/case-db.sql', 'utf8'), limits: existsSync('src/data/assessment/cases/limits.sql') ? readFileSync('src/data/assessment/cases/limits.sql', 'utf8') : '' };
  const runSql = (db, q) => {
    const d = new DatabaseSync(':memory:');
    d.exec(dbSql[db]);
    const st = d.prepare(q);
    const cols = st.columns().map((c) => c.name);
    const rows = st.all().map((r) => cols.map((c) => r[c]));
    d.close();
    return { columns: cols, values: rows };
  };
  let n = 0;
  for (const it of all) {
    if (it.type === 'sql') {
      const exp = runSql(it.db, it.solution);
      if (!exp.values.length) fail(`${it.id}: эталон SQL вернул пустой результат`);
      if (M.compareTables(exp, exp, it.ordered).score !== 1) fail(`${it.id}: эталон не проходит сравнение`);
      n++;
    }
    if (it.type === 'json-schema') {
      const r = M.checkJsonSchema(it, it.reference);
      if (r.score !== 1) fail(`${it.id}: эталон JSON Schema — ${JSON.stringify(r.notes.filter((x) => !x.ok))}`);
      const s = M.checkJsonSchema(it, it.start);
      if (s.score === 1) fail(`${it.id}: стартовый текст уже решает задание`);
      n++;
    }
    if (it.type === 'openapi') {
      const r = M.checkOpenApi(it, it.reference);
      if (r.score !== 1) fail(`${it.id}: эталон OpenAPI — ${JSON.stringify(r.notes.filter((x) => !x.ok))}`);
      if (M.checkOpenApi(it, it.start).score === 1) fail(`${it.id}: стартовый текст уже решает задание`);
      n++;
    }
    if (it.type === 'http') {
      const r = runHttp(it);
      if (r.score !== 1) fail(`${it.id}: эталон HTTP — ${JSON.stringify(r.notes.filter((x) => !x.ok))}`);
      n++;
    }
  }
  if (!bad) console.log(`[assessment] контент: ${all.length} заданий, ${C.EXAMS.length} экзамена, ${n} эталонов практики проходят проверки ✓`);
  return bad;
}

/** Прогнать эталонные curl-запросы HTTP-задания на учебном сервере с фиктивными часами. */
function runHttp(it) {
  let now = 1_700_000_000_000;
  const api = new M.MockApi(() => now);
  const vars = {};
  for (const ref of it.reference) {
    const text = ref.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    const p = M.parseCurl(text);
    if (!p.ok) return { score: 0, notes: [{ label: 'разбор эталона: ' + p.error, ok: false }] };
    const ex = api.handle(p.req);
    now += 1500;
    try {
      const b = JSON.parse(ex.res.body);
      if (b.access_token) vars[b.scope?.includes('payments') ? 'payToken' : 'token'] = b.access_token;
      if (b.orderId && ex.route === 'POST /orders') vars.orderId = b.orderId;
    } catch {}
    const etag = ex.res.headers.find(([h]) => h.toLowerCase() === 'etag');
    if (etag) vars.etag = etag[1];
  }
  return M.checkHttp(it, api.log);
}

if (failed) {
  console.error(`[assessment] проблем: ${failed}`);
  process.exit(1);
}
