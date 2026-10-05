/**
 * Браузерная часть движка аттестации: Markdown, SQL на sql.js, учебный сервер для HTTP-заданий,
 * автоматическая проверка практики при завершении попытки.
 */
import { marked } from 'marked';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { parseCurl, parseRaw } from '../../lib/api-lab/http';
import { MockApi, type Exchange } from '../../lib/api-lab/mock';
import { checkHttp, checkJsonSchema, checkOpenApi, compareTables, type Table } from '../../lib/assessment/validators';
import type { Answer, AutoResult } from '../../lib/assessment/score';
import type { Item, SqlItem } from '../../data/assessment/types';

export const md = (s: string) => marked.parse(s, { async: false }) as string;

// ---------- SQL ----------
const DB_URL: Record<SqlItem['db'], string> = { idm: '/data/case-db.sql', limits: '/data/assessment-limits.sql' };
let sqlPromise: Promise<SqlJsStatic> | null = null;
const dbCache = new Map<string, Promise<Uint8Array>>();

async function dbBytes(db: SqlItem['db']): Promise<{ SQL: SqlJsStatic; bytes: Uint8Array }> {
  sqlPromise ??= initSqlJs({ locateFile: (f: string) => `/vendor/sql.js/${f}` });
  const SQL = await sqlPromise;
  if (!dbCache.has(db))
    dbCache.set(
      db,
      fetch(DB_URL[db])
        .then((r) => {
          if (!r.ok) throw new Error(`${DB_URL[db]}: HTTP ${r.status}`);
          return r.text();
        })
        .then((text) => {
          const d = new SQL.Database();
          d.exec(text);
          const bytes = d.export();
          d.close();
          return bytes;
        }),
    );
  return { SQL, bytes: await dbCache.get(db)! };
}

export type SqlRun = { ok: true; table?: Table } | { ok: false; error: string };

/** Выполнить запрос на свежей копии учебной БД; вернуть последнюю таблицу результата. */
export async function runSql(db: SqlItem['db'], query: string): Promise<SqlRun> {
  try {
    const { SQL, bytes } = await dbBytes(db);
    const d = new SQL.Database(bytes);
    try {
      const res = d.exec(query);
      const last = res[res.length - 1];
      return { ok: true, table: last ? { columns: last.columns, values: last.values } : undefined };
    } finally {
      d.close();
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Схема учебной БД для справки в задании. */
export async function dbSchema(db: SqlItem['db']): Promise<{ name: string; columns: string[] }[]> {
  const { SQL, bytes } = await dbBytes(db);
  const d = new SQL.Database(bytes);
  try {
    const tables = d.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rowid")[0]?.values.map((v) => String(v[0])) ?? [];
    return tables.map((name) => ({ name, columns: (d.exec(`PRAGMA table_info(${name})`)[0]?.values ?? []).map((c) => String(c[1])) }));
  } finally {
    d.close();
  }
}

// ---------- HTTP ----------
/** Учебный сервер задания, восстановленный по сохранённому журналу (повтор запросов с их временем). */
export function restoreServer(log: Exchange[]): MockApi {
  let now: number | null = null;
  const api = new MockApi(() => now ?? Date.now());
  for (const e of log) {
    now = e.at;
    api.handle(e.req);
  }
  now = null;
  return api;
}

export function parseRequest(text: string) {
  const t = text.trim();
  return /^curl\s/i.test(t) ? parseCurl(t) : parseRaw(t);
}

// ---------- Проверка при завершении ----------
export async function evaluate(item: Item, answer: Answer | undefined, log: Exchange[] | undefined): Promise<AutoResult | undefined> {
  const text = answer?.t === 'text' ? answer.v : '';
  switch (item.type) {
    case 'sql': {
      if (!text.trim()) return { score: 0, notes: [{ label: 'Запрос не написан', ok: false }] };
      const [user, exp] = await Promise.all([runSql(item.db, text), runSql(item.db, item.solution)]);
      if (!user.ok) return { score: 0, notes: [{ label: `Запрос выполнился (${user.error})`, ok: false }] };
      if (!exp.ok || !exp.table) return { score: 0, notes: [{ label: 'Эталон не выполнился — сообщите об ошибке', ok: false }] };
      return compareTables(user.table, exp.table, item.ordered);
    }
    case 'http':
      return checkHttp(item, log ?? []);
    case 'json-schema':
      return text.trim() ? checkJsonSchema(item, text) : { score: 0, notes: [{ label: 'Ответ не написан', ok: false }] };
    case 'openapi':
      return text.trim() ? checkOpenApi(item, text) : { score: 0, notes: [{ label: 'Ответ не написан', ok: false }] };
    default:
      return undefined;
  }
}
