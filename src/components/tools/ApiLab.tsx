import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import YAML from 'yaml';
import { CLIENT_TIMEOUT_MS, getHeader, parseCurl, parseRaw, rawResponse, reason, toCurl, toRaw, type Header, type LabRequest, type LabResponse } from '../../lib/api-lab/http';
import { API_REFERENCE, BRANCHES, CLIENTS, MockApi, type Exchange } from '../../lib/api-lab/mock';
import { LAB_EXERCISES, type Mode } from '../../lib/api-lab/exercises';
import { ContractMock, STARTER_CONTRACT } from '../../lib/api-lab/contract-mock';
import { reviewOpenApi, type Review } from '../../lib/openapi-review';
import { renderRedoc } from '../../lib/redoc';
import { load, save } from '../../scripts/storage';
import './ApiLab.css';

type Tab = 'console' | 'tasks' | 'contract' | 'api';
type InputMode = Mode | 'form';
type Target = 'lab' | 'contract';
interface Shown {
  req: LabRequest;
  res: LabResponse;
  route: string;
  target: Target;
}

const KEY = 'api-lab';
const START_CURL = `curl -X POST https://api.lab.local/auth/token \\\n  -d 'grant_type=client_credentials&client_id=lab-client&client_secret=lab-secret'`;
const statusClass = (r: LabResponse) => (r.timeout ? 'is-timeout' : `is-${String(r.status)[0]}xx`);
const pretty = (body: string, headers: Header[]) => {
  if (!/json/i.test(getHeader(headers, 'Content-Type') ?? '')) return body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
};

/**
 * API Lab: HTTP-консоль (форма, сырой HTTP, curl) + учебный API в браузере + задания-отладка + мок по контракту.
 * Сеть не используется: запросы обрабатывают MockApi и ContractMock прямо на странице.
 */
export default function ApiLab() {
  const api = useRef(new MockApi());
  const [tab, setTab] = useState<Tab>('console');
  const [mode, setMode] = useState<InputMode>('curl');
  const [text, setText] = useState(START_CURL);
  const [form, setForm] = useState<LabRequest>({ method: 'GET', url: 'https://api.lab.local/branches', headers: [['Authorization', 'Bearer ']], body: '' });
  const [target, setTarget] = useState<Target>('lab');
  const [parseError, setParseError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [resTab, setResTab] = useState<'body' | 'headers' | 'rawReq' | 'rawRes'>('body');
  const [history, setHistory] = useState<Shown[]>([]);
  const [solved, setSolved] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [taskId, setTaskId] = useState(LAB_EXERCISES[0].id);
  const [showHint, setShowHint] = useState(false);
  const [contract, setContract] = useState(STARTER_CONTRACT);
  const [review, setReview] = useState<Review | null>(null);
  const [contractError, setContractError] = useState('');
  const redocHost = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = load<{ solved?: string[]; contract?: string; mode?: InputMode }>(KEY, {});
    setSolved(s.solved ?? []);
    if (s.contract) setContract(s.contract);
  }, []);
  const persist = (patch: { solved?: string[]; contract?: string }) => save(KEY, { solved, contract, ...patch });

  // Контракт → мок
  const contractMock = useMemo(() => {
    try {
      const doc = YAML.parse(contract);
      if (!doc || typeof doc !== 'object' || !doc.paths) return null;
      return new ContractMock(doc);
    } catch {
      return null;
    }
  }, [contract]);

  /** Текущий запрос из выбранного режима ввода. */
  const currentRequest = useCallback((): { req?: LabRequest; error?: string; warnings?: string[] } => {
    if (mode === 'form') return { req: { ...form, headers: form.headers.filter(([n]) => n.trim()) } };
    const p = mode === 'curl' ? parseCurl(text) : parseRaw(text);
    return p.ok ? { req: p.req, warnings: 'warnings' in p ? p.warnings : [] } : { error: p.error };
  }, [mode, form, text]);

  const switchMode = (next: InputMode) => {
    if (next === mode) return;
    const cur = currentRequest();
    if (cur.req) {
      if (next === 'form') setForm(cur.req);
      else setText(next === 'curl' ? toCurl(cur.req) : toRaw(cur.req));
      setParseError('');
    } else if (next !== 'form') setText(text); // не удалось разобрать — оставляем текст как есть
    setMode(next);
  };

  const send = async () => {
    const cur = currentRequest();
    setWarnings(cur.warnings ?? []);
    if (!cur.req) {
      setParseError(cur.error ?? 'Не удалось разобрать запрос');
      return;
    }
    setParseError('');
    setBusy(true);
    let item: Shown;
    if (target === 'contract') {
      if (!contractMock) {
        setParseError('Контракт не разобран — исправьте его на вкладке «Контракт».');
        setBusy(false);
        return;
      }
      const r = contractMock.handle(cur.req);
      item = { req: cur.req, res: r, route: r.route, target };
    } else {
      const ex: Exchange = api.current.handle(cur.req);
      item = { req: ex.req, res: ex.res, route: ex.route, target };
    }
    // Ожидание «сети» — до тайм-аута клиента
    await new Promise((r) => setTimeout(r, Math.min(item.res.latencyMs, CLIENT_TIMEOUT_MS)));
    setBusy(false);
    setShown(item);
    setResTab('body');
    setHistory((h) => [item, ...h].slice(0, 30));
    if (target === 'lab') {
      const newly = LAB_EXERCISES.filter((e) => !solved.includes(e.id) && e.check(api.current.log));
      if (newly.length) {
        const next = [...solved, ...newly.map((e) => e.id)];
        setSolved(next);
        persist({ solved: next });
        setToast(`Задание решено: ${newly.map((e) => `«${e.title}»`).join(', ')}`);
        setTimeout(() => setToast(''), 6000);
      }
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  };

  const loadTask = (id: string) => {
    const t = LAB_EXERCISES.find((x) => x.id === id)!;
    setTaskId(id);
    setMode(t.mode);
    setText(t.start);
    setTarget('lab');
    setShowHint(false);
    setTab('console');
  };

  const resetServer = () => {
    api.current.reset();
    setHistory([]);
    setShown(null);
    setToast('Учебный сервер сброшен: данные и токены — как в начале');
    setTimeout(() => setToast(''), 4000);
  };

  // ---------- Контракт ----------
  const checkContract = () => {
    try {
      const doc = YAML.parse(contract);
      setContractError('');
      setReview(reviewOpenApi(doc));
      return doc;
    } catch (e) {
      setReview(null);
      setContractError(`YAML: ${(e as Error).message.split('\n')[0]}`);
      return null;
    }
  };
  const preview = async () => {
    const doc = checkContract();
    if (!doc || !redocHost.current) return;
    if (reviewOpenApi(doc).externalRefs.length) {
      setContractError('В контракте есть внешние $ref — превью отключено, чтобы Redoc не обращался к сети.');
      return;
    }
    redocHost.current.innerHTML = '';
    const el = document.createElement('div');
    redocHost.current.append(el);
    try {
      await renderRedoc(doc, el);
    } catch (e) {
      setContractError(`Redoc: ${(e as Error).message}`);
    }
  };
  const tryOperation = (method: string, path: string) => {
    if (!contractMock) return;
    const req = contractMock.exampleRequest(method, path);
    setTarget('contract');
    setMode('curl');
    setText(toCurl(req));
    setTab('console');
  };

  const task = LAB_EXERCISES.find((t) => t.id === taskId)!;

  return (
    <div className="lab not-content">
      <div className="lab__tabs" role="tablist">
        {(
          [
            ['console', 'Консоль'],
            ['tasks', `Задания · ${solved.length}/${LAB_EXERCISES.length}`],
            ['contract', 'Контракт'],
            ['api', 'Учебный API'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {toast && (
        <p className="lab__toast" role="status">
          {toast}
        </p>
      )}

      {tab === 'console' && (
        <div className="lab__console">
          <div className="lab__bar">
            <div className="lab__seg" role="group" aria-label="Способ ввода">
              {(
                [
                  ['curl', 'curl'],
                  ['raw', 'Сырой HTTP'],
                  ['form', 'Форма'],
                ] as [InputMode, string][]
              ).map(([id, label]) => (
                <button key={id} type="button" className={mode === id ? 'is-active' : ''} onClick={() => switchMode(id)}>
                  {label}
                </button>
              ))}
            </div>
            <label className="lab__target">
              Сервер:{' '}
              <select value={target} onChange={(e) => setTarget(e.target.value as Target)}>
                <option value="lab">Учебный API</option>
                <option value="contract" disabled={!contractMock}>
                  Мок по контракту
                </option>
              </select>
            </label>
            {task && !solved.includes(task.id) && mode !== 'form' && text === task.start && (
              <span className="lab__task-note">
                Задание: {task.title} — {task.goal}
              </span>
            )}
          </div>

          {mode === 'form' ? (
            <div className="lab__form" onKeyDown={onKey}>
              <div className="lab__line">
                <select aria-label="Метод" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
                <input aria-label="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} spellCheck={false} />
              </div>
              <table className="lab__headers">
                <thead>
                  <tr>
                    <th>Заголовок</th>
                    <th>Значение</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {form.headers.map(([n, v], i) => (
                    <tr key={i}>
                      <td>
                        <input aria-label="Имя заголовка" value={n} onChange={(e) => setForm({ ...form, headers: form.headers.map((h, j) => (j === i ? [e.target.value, h[1]] : h)) })} spellCheck={false} />
                      </td>
                      <td>
                        <input aria-label="Значение заголовка" value={v} onChange={(e) => setForm({ ...form, headers: form.headers.map((h, j) => (j === i ? [h[0], e.target.value] : h)) })} spellCheck={false} />
                      </td>
                      <td>
                        <button type="button" className="lab__del" aria-label="Удалить заголовок" onClick={() => setForm({ ...form, headers: form.headers.filter((_, j) => j !== i) })}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="sa-btn" onClick={() => setForm({ ...form, headers: [...form.headers, ['', '']] })}>
                + Заголовок
              </button>
              <label className="lab__label" htmlFor="lab-body">
                Тело
              </label>
              <textarea id="lab-body" className="lab__code" rows={7} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} spellCheck={false} />
            </div>
          ) : (
            <>
              <label className="sr-only" htmlFor="lab-text">
                {mode === 'curl' ? 'Команда curl' : 'Сырой HTTP-запрос'}
              </label>
              <textarea id="lab-text" className="lab__code lab__input" rows={8} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} spellCheck={false} />
            </>
          )}

          <div className="lab__bar">
            <button type="button" className="sa-btn sa-btn--primary" onClick={send} disabled={busy}>
              {busy ? 'Ожидание ответа…' : 'Отправить'} <kbd>Ctrl+Enter</kbd>
            </button>
            <button type="button" className="sa-btn" onClick={resetServer}>
              Сбросить учебный сервер
            </button>
          </div>
          {parseError && <p className="lab__error">{parseError}</p>}
          {warnings.map((w, i) => (
            <p key={i} className="lab__warn">
              {w}
            </p>
          ))}

          {shown && (
            <section className="lab__response" aria-live="polite">
              <p className="lab__status">
                <span className={`lab__code-badge ${statusClass(shown.res)}`}>{shown.res.timeout ? 'Тайм-аут' : `${shown.res.status} ${reason(shown.res.status)}`}</span>
                <span>{shown.res.latencyMs} мс</span>
                <span>{shown.route}</span>
                {shown.target === 'contract' && <span className="lab__mock-tag">мок по контракту</span>}
                {!shown.res.timeout && (
                  <a href={`/tools/http-reference/#${shown.res.status}`} target="_blank" rel="noopener">
                    что значит {shown.res.status}
                  </a>
                )}
              </p>
              <div className="lab__seg" role="tablist" aria-label="Ответ">
                {(
                  [
                    ['body', 'Тело'],
                    ['headers', 'Заголовки'],
                    ['rawReq', 'Сырой запрос'],
                    ['rawRes', 'Сырой ответ'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={resTab === id} className={resTab === id ? 'is-active' : ''} onClick={() => setResTab(id)}>
                    {label}
                  </button>
                ))}
              </div>
              <pre className="lab__out">
                {resTab === 'body' && (shown.res.timeout ? `Сервер не ответил за ${CLIENT_TIMEOUT_MS / 1000} с — клиент прервал ожидание.` : pretty(shown.res.body, shown.res.headers) || '(пустое тело)')}
                {resTab === 'headers' && (shown.res.headers.map(([n, v]) => `${n}: ${v}`).join('\n') || '(нет заголовков)')}
                {resTab === 'rawReq' && toRaw(shown.req)}
                {resTab === 'rawRes' && rawResponse(shown.res)}
              </pre>
            </section>
          )}

          {history.length > 0 && (
            <details className="lab__history">
              <summary>История запросов ({history.length})</summary>
              <ol>
                {history.map((h, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => {
                        setMode('curl');
                        setText(toCurl(h.req));
                        setTarget(h.target);
                        setShown(h);
                      }}
                    >
                      <span className={`lab__code-badge ${statusClass(h.res)}`}>{h.res.timeout ? 'тайм-аут' : h.res.status}</span> {h.route}
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </div>
      )}

      {tab === 'tasks' && (
        <div className="lab__tasks">
          <nav aria-label="Задания">
            <ol>
              {LAB_EXERCISES.map((t) => (
                <li key={t.id}>
                  <button type="button" className={`${t.id === taskId ? 'is-active' : ''}${solved.includes(t.id) ? ' is-solved' : ''}`} onClick={() => (setTaskId(t.id), setShowHint(false))}>
                    <span aria-hidden="true">{solved.includes(t.id) ? '✓' : '○'}</span> <span className="lab__task-code">{t.code}</span> {t.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <article className="lab__task">
            <p className="lab__task-code">{task.code}</p>
            <h2>{task.title}</h2>
            <p>{task.story}</p>
            <p>
              <strong>Цель:</strong> {task.goal}.
            </p>
            <pre className="lab__out">{task.start}</pre>
            <div className="lab__bar">
              <button type="button" className="sa-btn sa-btn--primary" onClick={() => loadTask(task.id)}>
                Открыть в консоли
              </button>
              <button type="button" className="sa-btn" onClick={() => setShowHint((v) => !v)}>
                {showHint ? 'Скрыть подсказку' : 'Подсказка'}
              </button>
            </div>
            {showHint && <p className="lab__hint">{task.hint}</p>}
            {solved.includes(task.id) ? (
              <div className="lab__explain">
                <p className="lab__solved">✓ Решено</p>
                <p>{task.explanation}</p>
              </div>
            ) : (
              <p className="lab__note">Разбор откроется, когда задание будет решено. Проверяется то, что реально пришло на учебный сервер.</p>
            )}
          </article>
        </div>
      )}

      {tab === 'contract' && (
        <div className="lab__contract">
          <p className="lab__note">
            Contract-first: опишите API → проверьте → посмотрите документацию → включите мок → отправьте запрос из консоли. Мок проверяет обязательные
            параметры, Content-Type и тело по схеме, отвечает примерами из контракта; заголовок <code>Prefer: code=404</code> выбирает другой описанный ответ.
          </p>
          <label className="sr-only" htmlFor="lab-contract">
            Контракт OpenAPI (YAML)
          </label>
          <textarea
            id="lab-contract"
            className="lab__code lab__yaml"
            rows={22}
            value={contract}
            spellCheck={false}
            onChange={(e) => {
              setContract(e.target.value);
              persist({ contract: e.target.value });
            }}
          />
          <div className="lab__bar">
            <button type="button" className="sa-btn sa-btn--primary" onClick={checkContract}>
              Проверить
            </button>
            <button type="button" className="sa-btn" onClick={preview}>
              Превью
            </button>
            <button
              type="button"
              className="sa-btn"
              onClick={() => {
                setContract(STARTER_CONTRACT);
                persist({ contract: STARTER_CONTRACT });
              }}
            >
              Вернуть пример
            </button>
            <span className="lab__note">{contractMock ? `Мок готов: операций ${contractMock.ops.length}` : 'Мок недоступен — контракт не разобран'}</span>
          </div>
          {contractError && <p className="lab__error">{contractError}</p>}
          {review && (
            <ul className="lab__review">
              {review.findings.length === 0 && <li>Замечаний нет.</li>}
              {review.findings.map((f, i) => (
                <li key={i} className={`lvl-${f.level}`}>
                  <code>{f.where}</code> — {f.text}
                </li>
              ))}
            </ul>
          )}
          {contractMock && contractMock.ops.length > 0 && (
            <table className="lab__ops">
              <thead>
                <tr>
                  <th>Операция</th>
                  <th>Описание</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {contractMock.ops.map((o) => (
                  <tr key={o.method + o.path}>
                    <td>
                      <code>
                        {o.method} {o.path}
                      </code>
                    </td>
                    <td>{o.summary}</td>
                    <td>
                      <button type="button" className="sa-btn" onClick={() => tryOperation(o.method, o.path)}>
                        В консоль
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="openapi-viewer__body lab__redoc" ref={redocHost} />
        </div>
      )}

      {tab === 'api' && (
        <div className="lab__api">
          <p className="lab__note">
            Учебный сервер работает внутри этой страницы: запросы не уходят в сеть. Хост в URL может быть любым — маршрут определяется по пути (
            <code>/users</code>, <code>/v1/users</code> и <code>/api/v1/users</code> — одно и то же). Данные живут до перезагрузки страницы или кнопки «Сбросить».
          </p>
          <h3>Клиенты для получения токена</h3>
          <table>
            <thead>
              <tr>
                <th>client_id</th>
                <th>client_secret</th>
                <th>Права (scope)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(CLIENTS).map(([id, c]) => (
                <tr key={id}>
                  <td>
                    <code>{id}</code>
                  </td>
                  <td>
                    <code>{c.secret}</code>
                  </td>
                  <td>{c.scope.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3>Ресурсы</h3>
          <table>
            <thead>
              <tr>
                <th>Метод и путь</th>
                <th>Право</th>
                <th>Описание</th>
              </tr>
            </thead>
            <tbody>
              {API_REFERENCE.map((r) => (
                <tr key={r.method + r.path}>
                  <td>
                    <code>
                      {r.method} {r.path}
                    </code>
                  </td>
                  <td>{r.auth}</td>
                  <td>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="lab__note">
            Филиалы: {BRANCHES.map((b) => `${b.code} — ${b.name}`).join('; ')}. Тайм-аут клиента — {CLIENT_TIMEOUT_MS / 1000} с.
          </p>
        </div>
      )}
    </div>
  );
}
