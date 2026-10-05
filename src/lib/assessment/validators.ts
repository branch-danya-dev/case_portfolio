/**
 * Автоматическая проверка практических заданий. Без DOM и без сети: те же функции работают
 * в браузере (при завершении попытки) и в self-test (scripts/check-assessment.mjs).
 * SQL выполняет вызывающая сторона (sql.js в браузере, node:sqlite в тесте) и передаёт таблицы.
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse as parseYaml } from 'yaml';
import type { Exchange } from '../api-lab/mock';
import { lintRequirement } from '../req-lint';
import type { HttpItem, JsonSchemaItem, OpenApiItem, TextItem } from '../../data/assessment/types';
import type { AutoResult } from './score';

export interface Table {
  columns: string[];
  values: unknown[][];
}

const norm = (v: unknown) => (v === null || v === undefined ? '∅' : typeof v === 'number' || typeof v === 'bigint' ? String(Number(v)) : String(v));
const rowKey = (r: unknown[]) => JSON.stringify(r.map(norm));

/** Сравнение результатов по значениям: имена столбцов не важны, порядок строк — если ordered. */
export function compareTables(user: Table | undefined, expected: Table, ordered: boolean): AutoResult {
  const notes: AutoResult['notes'] = [];
  if (!user) return { score: 0, notes: [{ label: 'Запрос вернул таблицу', ok: false }] };
  const cols = user.columns.length === expected.columns.length;
  const rows = user.values.length === expected.values.length;
  notes.push({ label: `Столбцов: ${user.columns.length} (нужно ${expected.columns.length})`, ok: cols });
  notes.push({ label: `Строк: ${user.values.length} (нужно ${expected.values.length})`, ok: rows });
  const a = user.values.map(rowKey);
  const b = expected.values.map(rowKey);
  const sameSet = cols && rows && [...a].sort().join('\n') === [...b].sort().join('\n');
  notes.push({ label: 'Значения совпадают с эталоном', ok: sameSet });
  if (ordered) notes.push({ label: 'Порядок строк как в эталоне', ok: sameSet && a.every((k, i) => k === b[i]) });
  return { score: notes.every((n) => n.ok) ? 1 : 0, notes };
}

const frac = (notes: AutoResult['notes']): AutoResult => ({ score: notes.length ? notes.filter((n) => n.ok).length / notes.length : 0, notes });

export function checkHttp(item: HttpItem, log: Exchange[]): AutoResult {
  return frac(item.criteria.map((c) => ({ label: c.label, ok: safe(() => c.test(log)) })));
}

function safe(f: () => boolean): boolean {
  try {
    return !!f();
  } catch {
    return false;
  }
}

let ajv: Ajv | null = null;
function getAjv() {
  if (!ajv) {
    ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
  }
  return ajv;
}

export function checkJsonSchema(item: JsonSchemaItem, text: string): AutoResult {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { score: 0, notes: [{ label: `Корректный JSON (${(e as Error).message})`, ok: false }] };
  }
  const notes: AutoResult['notes'] = [{ label: 'Корректный JSON', ok: true }];
  if (item.mode === 'schema') {
    let validate;
    try {
      validate = getAjv().compile(doc as object);
    } catch (e) {
      notes.push({ label: `Схема компилируется (${(e as Error).message})`, ok: false });
      return frac(notes);
    }
    (item.valid ?? []).forEach((v, i) => notes.push({ label: `Принимает корректный пример ${i + 1}`, ok: !!validate(v) }));
    (item.invalid ?? []).forEach((v, i) => notes.push({ label: `Отклоняет некорректный пример ${i + 1}`, ok: !validate(v) }));
  } else {
    const validate = getAjv().compile(item.schema!);
    notes.push({ label: 'Документ проходит схему', ok: !!validate(doc) });
    for (const x of item.extra ?? []) notes.push({ label: x.label, ok: safe(() => x.test(doc)) });
  }
  return frac(notes);
}

export function checkOpenApi(item: OpenApiItem, text: string): AutoResult {
  let doc: any;
  try {
    doc = parseYaml(text);
  } catch (e) {
    return { score: 0, notes: [{ label: `Корректный YAML (${(e as Error).message.split('\n')[0]})`, ok: false }] };
  }
  if (!doc || typeof doc !== 'object') return { score: 0, notes: [{ label: 'Документ — объект OpenAPI', ok: false }] };
  return frac(item.checks.map((c) => ({ label: c.label, ok: safe(() => c.test(doc)) })));
}

/** Частичная проверка открытого ответа: линтер требований по каждой непустой строке. Только подсказка, в балл не входит. */
export function lintText(item: TextItem, text: string): { line: string; issues: string[] }[] {
  if (item.lint !== 'requirements') return [];
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 10)
    .map((line) => ({ line, issues: lintRequirement(line).filter((i) => i.severity !== 'info').map((i) => i.message) }))
    .filter((x) => x.issues.length);
}
