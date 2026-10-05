/**
 * Задание в режиме попытки: условие и поле ответа. Эталоны, разборы и ссылки здесь не показываются —
 * только после завершения (Results). Практика выполняется «по-настоящему»: SQL на учебной БД,
 * запросы к учебному серверу, но без вердикта «верно / неверно».
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import YAML from 'yaml';
import { getHeader, reason } from '../../lib/api-lab/http';
import type { Exchange } from '../../lib/api-lab/mock';
import { permutation } from '../../lib/assessment/rng';
import type { Answer } from '../../lib/assessment/score';
import { lintText } from '../../lib/assessment/validators';
import type { Item, OrderItem } from '../../data/assessment/types';
import { dbSchema, md, parseRequest, restoreServer, runSql, type SqlRun } from './engine';

interface Props {
  item: Item;
  seed: number;
  answer?: Answer;
  log?: Exchange[];
  onAnswer: (a: Answer) => void;
  onLog: (log: Exchange[]) => void;
}

export default function ItemView(props: Props) {
  const { item } = props;
  return (
    <div className="exam-item">
      <div className="exam-item__prompt" dangerouslySetInnerHTML={{ __html: md(item.prompt) }} />
      {item.type === 'single' || item.type === 'multiple' ? <Choice {...props} /> : null}
      {item.type === 'order' ? <Order {...props} item={item} /> : null}
      {item.type === 'match' ? <Match {...props} /> : null}
      {item.type === 'sql' ? <Sql {...props} /> : null}
      {item.type === 'http' ? <Http {...props} /> : null}
      {item.type === 'json-schema' || item.type === 'openapi' ? <Code {...props} /> : null}
      {item.type === 'text' ? <Text {...props} /> : null}
    </div>
  );
}

// ---------- Выбор ----------
function Choice({ item, seed, answer, onAnswer }: Props) {
  if (item.type !== 'single' && item.type !== 'multiple') return null;
  const order = useMemo(() => permutation(seed, item.id, item.options.length), [seed, item]);
  const multi = item.type === 'multiple';
  const chosen = new Set(answer?.t === 'multiple' ? answer.v : answer?.t === 'single' ? [answer.v] : []);
  const toggle = (i: number) => {
    if (!multi) return onAnswer({ t: 'single', v: i });
    const next = new Set(chosen);
    next.has(i) ? next.delete(i) : next.add(i);
    onAnswer({ t: 'multiple', v: [...next].sort((a, b) => a - b) });
  };
  return (
    <fieldset className="exam-choice">
      <legend>{multi ? 'Выберите все верные варианты' : 'Выберите один вариант'}</legend>
      {order.map((i) => (
        <label key={i} className={chosen.has(i) ? 'is-chosen' : ''}>
          <input type={multi ? 'checkbox' : 'radio'} name={item.id} checked={chosen.has(i)} onChange={() => toggle(i)} />
          <span dangerouslySetInnerHTML={{ __html: md(item.options[i]).replace(/^<p>|<\/p>\s*$/g, '') }} />
        </label>
      ))}
    </fieldset>
  );
}

// ---------- Порядок ----------
function Order({ item, seed, answer, onAnswer }: Props & { item: OrderItem }) {
  const initial = useMemo(() => permutation(seed, item.id, item.steps.length), [seed, item]);
  const seq = answer?.t === 'order' && answer.v.length === item.steps.length ? answer.v : initial;
  const move = (pos: number, d: -1 | 1) => {
    const next = [...seq];
    const to = pos + d;
    if (to < 0 || to >= next.length) return;
    [next[pos], next[to]] = [next[to], next[pos]];
    onAnswer({ t: 'order', v: next });
  };
  return (
    <div className="exam-order">
      <p className="exam-hint">Расставьте шаги кнопками ↑ и ↓. Порядок засчитывается, даже если вы его не меняли, — проверьте его.</p>
      <ol>
        {seq.map((i, pos) => (
          <li key={i}>
            <span>{item.steps[i]}</span>
            <span className="exam-order__btns">
              <button type="button" className="sa-btn" onClick={() => move(pos, -1)} disabled={pos === 0} aria-label={`Поднять: ${item.steps[i]}`}>
                ↑
              </button>
              <button type="button" className="sa-btn" onClick={() => move(pos, 1)} disabled={pos === seq.length - 1} aria-label={`Опустить: ${item.steps[i]}`}>
                ↓
              </button>
            </span>
          </li>
        ))}
      </ol>
      {answer?.t !== 'order' && (
        <button type="button" className="sa-btn" onClick={() => onAnswer({ t: 'order', v: seq })}>
          Порядок верный, сохранить как есть
        </button>
      )}
    </div>
  );
}

// ---------- Сопоставление ----------
function Match({ item, seed, answer, onAnswer }: Props) {
  if (item.type !== 'match') return null;
  const order = useMemo(() => permutation(seed, item.id, item.pairs.length), [seed, item]);
  const v = answer?.t === 'match' ? answer.v : item.pairs.map(() => null);
  const set = (i: number, r: string) => {
    const next = [...v];
    next[i] = r === '' ? null : Number(r);
    onAnswer({ t: 'match', v: next });
  };
  return (
    <table className="exam-match">
      <tbody>
        {item.pairs.map((p, i) => (
          <tr key={i}>
            <th scope="row">{p.left}</th>
            <td>
              <select value={v[i] ?? ''} onChange={(e) => set(i, e.target.value)} aria-label={`Соответствие для: ${p.left}`}>
                <option value="">— выберите —</option>
                {order.map((r) => (
                  <option key={r} value={r}>
                    {item.pairs[r].right}
                  </option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---------- Редактор кода ----------
/** Textarea с Tab-отступом; Esc отпускает фокус (правило доступности проекта). */
function Editor({ value, onChange, label, rows = 10, onRun }: { value: string; onChange: (v: string) => void; label: string; rows?: number; onRun?: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const tabMode = useRef(true);
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      tabMode.current = false;
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onRun) {
      e.preventDefault();
      onRun();
      return;
    }
    if (e.key === 'Tab' && tabMode.current && !e.shiftKey) {
      e.preventDefault();
      const el = e.currentTarget;
      const s = el.selectionStart;
      const next = value.slice(0, s) + '  ' + value.slice(el.selectionEnd);
      onChange(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };
  return (
    <textarea
      ref={ref}
      className="exam-code"
      aria-label={label}
      spellCheck={false}
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKey}
      onFocus={() => (tabMode.current = true)}
    />
  );
}

const textOf = (a?: Answer) => (a?.t === 'text' ? a.v : undefined);

// ---------- SQL ----------
function Sql({ item, answer, onAnswer }: Props) {
  if (item.type !== 'sql') return null;
  const [run, setRun] = useState<SqlRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [schema, setSchema] = useState<{ name: string; columns: string[] }[]>([]);
  const query = textOf(answer) ?? '';
  useEffect(() => {
    dbSchema(item.db).then(setSchema, () => setSchema([]));
  }, [item.db]);
  const exec = async () => {
    setBusy(true);
    setRun(await runSql(item.db, query));
    setBusy(false);
  };
  return (
    <div className="exam-practice">
      <details className="exam-schema">
        <summary>Схема учебной БД</summary>
        <ul>
          {schema.map((t) => (
            <li key={t.name}>
              <code>{t.name}</code>: {t.columns.join(', ')}
            </li>
          ))}
        </ul>
      </details>
      <Editor value={query} onChange={(v) => onAnswer({ t: 'text', v })} label="SQL-запрос" onRun={exec} />
      <div className="exam-bar">
        <button type="button" className="sa-btn sa-btn--primary" onClick={exec} disabled={busy || !query.trim()}>
          Выполнить <kbd>Ctrl+Enter</kbd>
        </button>
        <span className="exam-hint">Результат запроса виден, проверка на соответствие заданию — после завершения.</span>
      </div>
      {run && !run.ok && <p className="exam-error">{run.error}</p>}
      {run?.ok && !run.table && <p className="exam-hint">Запрос выполнен, таблицы в результате нет.</p>}
      {run?.ok && run.table && (
        <div className="exam-table-wrap" tabIndex={0} role="region" aria-label="Результат запроса">
          <table className="exam-table">
            <thead>
              <tr>
                {run.table.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {run.table.values.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j}>{v === null ? <em>NULL</em> : String(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="exam-hint">Строк: {run.table.values.length}</p>
        </div>
      )}
    </div>
  );
}

// ---------- HTTP ----------
function Http({ item, answer, log = [], onAnswer, onLog }: Props) {
  if (item.type !== 'http') return null;
  const text = textOf(answer) ?? item.start;
  // Сервер восстанавливается по журналу один раз при открытии задания.
  const server = useRef<ReturnType<typeof restoreServer> | null>(null);
  server.current ??= restoreServer(log);
  const [error, setError] = useState('');
  const [shown, setShown] = useState<Exchange | null>(log[log.length - 1] ?? null);
  const send = () => {
    const p = parseRequest(text);
    if (!p.ok) {
      setError(p.error);
      return;
    }
    setError('');
    const api = server.current!;
    const ex = api.handle(p.req);
    setShown(ex);
    onLog([...api.log]);
  };
  const reset = () => {
    server.current = restoreServer([]);
    setShown(null);
    onLog([]);
  };
  return (
    <div className="exam-practice">
      <p className="exam-hint">
        Учебный сервер API Lab (<code>https://api.lab.local</code>) работает прямо на странице. Запрос — в виде curl или сырого HTTP. Засчитывается то, что реально пришло на сервер.
      </p>
      <Editor value={text} onChange={(v) => onAnswer({ t: 'text', v })} label="HTTP-запрос (curl или сырой HTTP)" rows={6} onRun={send} />
      <div className="exam-bar">
        <button type="button" className="sa-btn sa-btn--primary" onClick={send}>
          Отправить <kbd>Ctrl+Enter</kbd>
        </button>
        <button type="button" className="sa-btn" onClick={reset} disabled={!log.length}>
          Сбросить сервер
        </button>
        <span className="exam-hint">Запросов: {log.length}</span>
      </div>
      {error && <p className="exam-error">{error}</p>}
      {shown && (
        <div className="exam-response">
          <p className="exam-response__status">
            <strong>{shown.res.timeout ? 'Тайм-аут' : `${shown.res.status} ${reason(shown.res.status)}`}</strong> · {shown.route}
          </p>
          {shown.res.headers.length > 0 && (
            <div className="exam-raw">
              {shown.res.headers.map(([h, v]) => `${h}: ${v}`).join('\n')}
            </div>
          )}
          {shown.res.body && <div className="exam-raw">{shown.res.body}</div>}
        </div>
      )}
      {log.length > 1 && (
        <details className="exam-history">
          <summary>История запросов</summary>
          <ol>
            {log.map((e, i) => (
              <li key={i}>
                <button type="button" className="exam-link" onClick={() => setShown(e)}>
                  {e.req.method} {e.req.url.replace(/^https?:\/\/[^/]+/, '')} → {e.res.timeout ? 'тайм-аут' : e.res.status}
                  {getHeader(e.req.headers, 'Idempotency-Key') ? ` · ключ ${getHeader(e.req.headers, 'Idempotency-Key')}` : ''}
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

// ---------- JSON Schema / OpenAPI ----------
function Code({ item, answer, onAnswer }: Props) {
  if (item.type !== 'json-schema' && item.type !== 'openapi') return null;
  const text = textOf(answer) ?? item.start;
  const [syntax, setSyntax] = useState('');
  const check = () => {
    try {
      if (item.type === 'json-schema') JSON.parse(text);
      else YAML.parse(text);
      setSyntax('Синтаксис корректен. Соответствие заданию проверяется после завершения.');
    } catch (e) {
      setSyntax(`Ошибка синтаксиса: ${(e as Error).message.split('\n')[0]}`);
    }
  };
  return (
    <div className="exam-practice">
      <Editor value={text} onChange={(v) => onAnswer({ t: 'text', v })} label={item.type === 'openapi' ? 'Контракт OpenAPI (YAML)' : 'JSON'} rows={item.type === 'openapi' ? 24 : 16} />
      <div className="exam-bar">
        <button type="button" className="sa-btn" onClick={check}>
          Проверить синтаксис
        </button>
        <button type="button" className="sa-btn" onClick={() => onAnswer({ t: 'text', v: item.start })}>
          Вернуть исходный текст
        </button>
        {syntax && <span className="exam-hint" role="status">{syntax}</span>}
      </div>
    </div>
  );
}

// ---------- Открытый ответ ----------
function Text({ item, answer, onAnswer }: Props) {
  if (item.type !== 'text') return null;
  const text = textOf(answer) ?? '';
  const lint = useMemo(() => lintText(item, text), [item, text]);
  return (
    <div className="exam-practice">
      <Editor value={text} onChange={(v) => onAnswer({ t: 'text', v })} label="Ваш ответ" rows={10} />
      {item.placeholder && !text && <p className="exam-hint">Начните, например, так: {item.placeholder}</p>}
      {item.lint && lint.length > 0 && (
        <div className="exam-lint" role="status">
          <p>Линтер требований:</p>
          <ul>
            {lint.map((l, i) => (
              <li key={i}>
                «{l.line.slice(0, 60)}{l.line.length > 60 ? '…' : ''}» — {l.issues.join('; ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="exam-hint">Открытый ответ оценивается после завершения: вы увидите эталон и критерии и отметите выполненные.</p>
    </div>
  );
}
