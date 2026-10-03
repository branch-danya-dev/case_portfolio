import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import initSqlJs, { type Database, type QueryExecResult, type SqlJsStatic } from 'sql.js';
import { SQL_TASKS, type SqlTask } from '../../data/sql-tasks';
import { load, save } from '../../scripts/storage';
import './SqlTrainer.css';

type Cell = string | number | null | Uint8Array;
interface RunResult {
  ok: boolean;
  error?: string;
  result?: QueryExecResult;
  ms?: number;
}
interface Verdict {
  ok: boolean;
  text: string;
}
interface TableInfo {
  name: string;
  columns: { name: string; type: string; pk: boolean; fk?: string }[];
}

const MAX_ROWS = 200;
const SOLVED_KEY = 'sql-trainer:solved';
const DRAFTS_KEY = 'sql-trainer:drafts';
const FREE_KEY = 'sql-trainer:free';
const FREE_DEFAULT = 'SELECT system_code, status, COUNT(*) AS cnt\nFROM account\nGROUP BY system_code, status\nORDER BY system_code;';

const norm = (v: Cell) => (v === null ? '∅' : v instanceof Uint8Array ? `blob:${v.length}` : typeof v === 'number' ? String(Number(v)) : String(v));
const rowKey = (r: Cell[]) => JSON.stringify(r.map(norm));

/** Сравнить результат пользователя с эталоном по значениям. */
function compare(user: QueryExecResult | undefined, expected: QueryExecResult | undefined, ordered: boolean): Verdict {
  const exp = expected ?? { columns: [], values: [] };
  if (!user) return { ok: false, text: 'Запрос не вернул таблицу. Последней командой должен быть SELECT.' };
  if (user.columns.length !== exp.columns.length)
    return { ok: false, text: `Столбцов ${user.columns.length}, а нужно ${exp.columns.length}. Проверьте, что выводите именно то, что просят.` };
  if (user.values.length !== exp.values.length)
    return { ok: false, text: `Строк ${user.values.length}, а нужно ${exp.values.length}. Проверьте условия отбора и соединения.` };
  const a = user.values.map(rowKey);
  const b = exp.values.map(rowKey);
  if (ordered) {
    if (a.every((k, i) => k === b[i])) return { ok: true, text: 'Верно!' };
    const sameSet = [...a].sort().join('\n') === [...b].sort().join('\n');
    return { ok: false, text: sameSet ? 'Строки верные, но порядок другой — проверьте ORDER BY.' : 'Количество строк совпадает, но значения отличаются.' };
  }
  if ([...a].sort().join('\n') === [...b].sort().join('\n')) return { ok: true, text: 'Верно! (порядок строк в этом задании не важен)' };
  return { ok: false, text: 'Количество строк совпадает, но значения отличаются — проверьте столбцы и их порядок.' };
}

/**
 * SQL-тренажёр: задания с проверкой по эталону и свободный режим на учебной БД кейса.
 * SQLite в WebAssembly (sql.js); каждый запрос выполняется на свежей копии БД.
 */
export default function SqlTrainer() {
  const [engine, setEngine] = useState<{ SQL: SqlJsStatic; bytes: Uint8Array } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [schema, setSchema] = useState<TableInfo[]>([]);
  const [mode, setMode] = useState<'tasks' | 'free'>('tasks');
  const [taskId, setTaskId] = useState(SQL_TASKS[0].id);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [free, setFree] = useState(FREE_DEFAULT);
  const [solved, setSolved] = useState<string[]>([]);
  const [run, setRun] = useState<RunResult | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Загрузка движка и БД
  useEffect(() => {
    (async () => {
      try {
        const [SQL, text] = await Promise.all([
          initSqlJs({ locateFile: (f: string) => `/vendor/sql.js/${f}` }),
          fetch('/data/case-db.sql').then((r) => {
            if (!r.ok) throw new Error(`case-db.sql: HTTP ${r.status}`);
            return r.text();
          }),
        ]);
        const db = new SQL.Database();
        db.exec(text);
        // Схема для справки
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rowid")[0]?.values.map((v) => String(v[0])) ?? [];
        setSchema(
          tables.map((name) => {
            const fks = new Map((db.exec(`PRAGMA foreign_key_list(${name})`)[0]?.values ?? []).map((v) => [String(v[3]), `${v[2]}.${v[4]}`]));
            const cols = db.exec(`PRAGMA table_info(${name})`)[0]?.values ?? [];
            return { name, columns: cols.map((c) => ({ name: String(c[1]), type: String(c[2]), pk: Number(c[5]) > 0, fk: fks.get(String(c[1])) })) };
          }),
        );
        setEngine({ SQL, bytes: db.export() });
        db.close();
      } catch (e) {
        setLoadError((e as Error).message);
      }
    })();
    setSolved(load<string[]>(SOLVED_KEY, []));
    setDrafts(load<Record<string, string>>(DRAFTS_KEY, {}));
    setFree(load<string>(FREE_KEY, FREE_DEFAULT));
  }, []);

  const task = SQL_TASKS.find((t) => t.id === taskId)!;
  const query = mode === 'tasks' ? (drafts[taskId] ?? '') : free;
  const setQuery = (q: string) => {
    if (mode === 'tasks') {
      const next = { ...drafts, [taskId]: q };
      setDrafts(next);
      save(DRAFTS_KEY, next);
    } else {
      setFree(q);
      save(FREE_KEY, q);
    }
  };

  const exec = useCallback(
    (sql: string): RunResult => {
      if (!engine) return { ok: false, error: 'База ещё загружается' };
      const db: Database = new engine.SQL.Database(engine.bytes);
      const t0 = performance.now();
      try {
        // Не db.exec: для пустого результата он не возвращает даже имена столбцов,
        // а для проверки «строк 0, а нужно 1» они нужны. Результат — последней команды со столбцами.
        let last: QueryExecResult | undefined;
        for (const stmt of db.iterateStatements(sql)) {
          const columns = stmt.getColumnNames();
          const values: Cell[][] = [];
          while (stmt.step()) values.push(stmt.get() as Cell[]);
          if (columns.length) last = { columns, values: values as QueryExecResult['values'] };
        }
        return { ok: true, result: last, ms: performance.now() - t0 };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      } finally {
        db.close();
      }
    },
    [engine],
  );

  const onRun = (check: boolean) => {
    if (!query.trim()) return;
    const r = exec(query);
    setRun(r);
    if (!check || mode !== 'tasks' || !r.ok) {
      setVerdict(check && mode === 'tasks' && !r.ok ? { ok: false, text: 'Запрос завершился ошибкой — исправьте её и проверьте снова.' } : null);
      return;
    }
    const expected = exec(task.solution);
    const v = compare(r.result, expected.result, task.ordered);
    setVerdict(v);
    if (v.ok && !solved.includes(task.id)) {
      const next = [...solved, task.id];
      setSolved(next);
      save(SOLVED_KEY, next);
    }
  };

  const selectTask = (t: SqlTask) => {
    setTaskId(t.id);
    setRun(null);
    setVerdict(null);
    setShowHint(false);
    setShowSolution(false);
    editorRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun(mode === 'tasks');
    } else if (e.key === 'Escape') {
      // Esc снимает «захват» Tab: следующий Tab — обычный переход фокуса (не ловушка для клавиатуры)
      e.currentTarget.dataset.tabEscape = '1';
      return;
    } else if (e.key === 'Tab' && !e.shiftKey && e.currentTarget.dataset.tabEscape !== '1') {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: en } = el;
      setQuery(query.slice(0, s) + '  ' + query.slice(en));
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
    if (e.key !== 'Tab') delete e.currentTarget.dataset.tabEscape;
  };

  const levels = useMemo(() => [...new Set(SQL_TASKS.map((t) => t.level))], []);

  if (loadError) return <p className="sqlt__error">Не удалось загрузить SQL-движок или учебную БД: {loadError}</p>;

  return (
    <div className="sqlt not-content">
      <div className="sqlt__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'tasks'} className={mode === 'tasks' ? 'is-active' : ''} onClick={() => (setMode('tasks'), setRun(null), setVerdict(null))}>
          Задания · решено {solved.filter((id) => SQL_TASKS.some((t) => t.id === id)).length} из {SQL_TASKS.length}
        </button>
        <button type="button" role="tab" aria-selected={mode === 'free'} className={mode === 'free' ? 'is-active' : ''} onClick={() => (setMode('free'), setRun(null), setVerdict(null))}>
          Свободный режим
        </button>
      </div>

      <div className="sqlt__layout">
        <aside className="sqlt__side">
          {mode === 'tasks' && (
            <nav aria-label="Задания">
              {levels.map((l) => (
                <div key={l}>
                  <h3>{l}</h3>
                  <ol>
                    {SQL_TASKS.filter((t) => t.level === l).map((t) => (
                      <li key={t.id}>
                        <button type="button" className={`${t.id === taskId ? 'is-active' : ''}${solved.includes(t.id) ? ' is-solved' : ''}`} onClick={() => selectTask(t)}>
                          <span aria-hidden="true">{solved.includes(t.id) ? '✓' : '○'}</span> {t.title}
                          {solved.includes(t.id) && <span className="sr-only"> (решено)</span>}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </nav>
          )}
          <details className="sqlt__schema" open={mode === 'free'}>
            <summary>Схема учебной БД</summary>
            {schema.map((t) => (
              <div key={t.name}>
                <strong>{t.name}</strong>
                <ul>
                  {t.columns.map((c) => (
                    <li key={c.name}>
                      <code>{c.name}</code> <small>{c.type.toLowerCase()}</small>
                      {c.pk && <span className="sqlt__key">PK</span>}
                      {c.fk && <span className="sqlt__key sqlt__key--fk">→ {c.fk}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        </aside>

        <section className="sqlt__main">
          {mode === 'tasks' && (
            <div className="sqlt__task">
              <p className="sqlt__meta">
                {task.level} · {task.topic} {task.ordered && '· порядок строк важен'}
              </p>
              <h2>{task.title}</h2>
              <p>{task.text}</p>
            </div>
          )}

          <label htmlFor="sqlt-editor" className="sr-only">
            SQL-запрос
          </label>
          <textarea
            id="sqlt-editor"
            ref={editorRef}
            className="sqlt__editor"
            spellCheck={false}
            value={query}
            placeholder={mode === 'tasks' ? 'SELECT …' : ''}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
          />
          <div className="sqlt__bar">
            {mode === 'tasks' ? (
              <>
                <button type="button" className="sa-btn sa-btn--primary" disabled={!engine} onClick={() => onRun(true)}>
                  Проверить <kbd>Ctrl+Enter</kbd>
                </button>
                <button type="button" className="sa-btn" disabled={!engine} onClick={() => onRun(false)}>
                  Выполнить
                </button>
                <button type="button" className="sa-btn" onClick={() => setShowHint((v) => !v)}>
                  {showHint ? 'Скрыть подсказку' : 'Подсказка'}
                </button>
                <button type="button" className="sa-btn" onClick={() => setShowSolution((v) => !v)}>
                  {showSolution ? 'Скрыть решение' : 'Показать решение'}
                </button>
              </>
            ) : (
              <button type="button" className="sa-btn sa-btn--primary" disabled={!engine} onClick={() => onRun(false)}>
                Выполнить <kbd>Ctrl+Enter</kbd>
              </button>
            )}
            {!engine && <span className="sqlt__loading">Загрузка SQLite…</span>}
            <span className="sqlt__note">Tab в редакторе — отступ; чтобы перейти дальше с клавиатуры: Esc, затем Tab</span>
          </div>

          {mode === 'tasks' && showHint && <p className="sqlt__hint">{task.hint}</p>}
          {mode === 'tasks' && showSolution && (
            <div className="sqlt__solution">
              <pre>{task.solution}</pre>
              <button type="button" className="sa-btn" onClick={() => setQuery(task.solution)}>
                Вставить в редактор
              </button>
            </div>
          )}

          {verdict && (
            <p className={`sqlt__verdict ${verdict.ok ? 'is-ok' : 'is-bad'}`} role="status">
              {verdict.text}
            </p>
          )}
          {run && !run.ok && <p className="sqlt__error">Ошибка SQL: {run.error}</p>}
          {run?.ok && !run.result && <p className="sqlt__note">Запрос выполнен, таблицы в ответе нет (изменения не сохраняются — каждый запрос идёт на свежей копии БД).</p>}
          {run?.ok && run.result && (
            <div className="sqlt__result">
              <p className="sqlt__note">
                Строк: {run.result.values.length}
                {run.result.values.length > MAX_ROWS && `, показаны первые ${MAX_ROWS}`} · {run.ms!.toFixed(1)} мс
              </p>
              <div className="sqlt__table-wrap">
                <table>
                  <thead>
                    <tr>
                      {run.result.columns.map((c, i) => (
                        <th key={i}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {run.result.values.slice(0, MAX_ROWS).map((row, i) => (
                      <tr key={i}>
                        {row.map((v, j) => (
                          <td key={j} className={v === null ? 'is-null' : typeof v === 'number' ? 'is-num' : ''}>
                            {v === null ? 'NULL' : norm(v as Cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
