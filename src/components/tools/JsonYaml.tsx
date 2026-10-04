import { useEffect, useMemo, useState } from 'react';
import YAML from 'yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { locateJsonError } from '../../lib/json-locate';
import { ruError } from '../../lib/ajv-ru';
import { EMPLOYEE_EVENT_BAD, EMPLOYEE_EVENT_EXAMPLES, EMPLOYEE_EVENT_SCHEMA } from '../../data/json-examples';
import { copyText, downloadText } from '../../lib/share';
import { load, save } from '../../scripts/storage';
import './JsonYaml.css';

type Fmt = 'json' | 'yaml';
interface Parsed {
  ok: boolean;
  value?: unknown;
  fmt?: Fmt;
  error?: string;
}

/** Номер строки и столбца по смещению в тексте. */
function lineCol(text: string, pos: number) {
  const before = text.slice(0, pos);
  const line = before.split('\n').length;
  return { line, col: pos - before.lastIndexOf('\n') };
}

/** Разбор: явный формат или автоопределение (JSON, затем YAML). */
function parse(text: string, as: Fmt | 'auto'): Parsed {
  if (!text.trim()) return { ok: false, error: 'Пусто' };
  const tryJson = (): Parsed => {
    try {
      return { ok: true, value: JSON.parse(text), fmt: 'json' };
    } catch (e) {
      const loc = locateJsonError(text);
      if (loc) {
        const where = lineCol(text, loc.pos);
        return { ok: false, fmt: 'json', error: `JSON, строка ${where.line}, столбец ${where.col}: ${loc.message}` };
      }
      return { ok: false, fmt: 'json', error: `JSON: ${(e as Error).message}` };
    }
  };
  const tryYaml = (): Parsed => {
    const doc = YAML.parseDocument(text, { prettyErrors: true });
    if (doc.errors.length) {
      const err = doc.errors[0];
      const p = err.linePos?.[0];
      // Библиотека дописывает «at line N, column M:» — место показываем сами, единообразно с JSON.
      const msg = err.message.split('\n')[0].replace(/\s*at line \d+, column \d+:?\s*$/, '');
      return { ok: false, fmt: 'yaml', error: `YAML${p ? `, строка ${p.line}, столбец ${p.col}` : ''}: ${msg}` };
    }
    return { ok: true, value: doc.toJS(), fmt: 'yaml' };
  };
  if (as === 'json') return tryJson();
  if (as === 'yaml') return tryYaml();
  const t = text.trimStart();
  // Похоже на JSON — разбираем как JSON и показываем ошибку JSON, а не YAML (YAML — надмножество JSON и сообщит непонятнее).
  if (t.startsWith('{') || t.startsWith('[')) return tryJson();
  return tryYaml();
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}
const toJson = (v: unknown, min = false) => JSON.stringify(v, null, min ? 0 : 2);
const toYaml = (v: unknown) => YAML.stringify(v, { lineWidth: 0 });

interface Saved {
  input: string;
  schema: string;
  doc: string;
}
const HIRE = toJson(EMPLOYEE_EVENT_EXAMPLES[0].payload);
const DEFAULTS: Saved = { input: HIRE, schema: toJson(EMPLOYEE_EVENT_SCHEMA), doc: toJson(EMPLOYEE_EVENT_BAD) };

/**
 * JSON / YAML: форматирование, сжатие, сортировка ключей, конвертация, проверка по JSON Schema (ajv, draft-07).
 * Всё считается в браузере; тексты хранятся в localStorage этого браузера.
 */
export default function JsonYaml() {
  const [tab, setTab] = useState<'format' | 'schema'>('format');
  const [st, setSt] = useState<Saved>(DEFAULTS);
  const [as, setAs] = useState<Fmt | 'auto'>('auto');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => setSt({ ...DEFAULTS, ...load<Partial<Saved>>('json-yaml', {}) }), []);
  const update = (patch: Partial<Saved>) =>
    setSt((s) => {
      const next = { ...s, ...patch };
      save('json-yaml', next);
      return next;
    });
  const flash = (s: string) => {
    setStatus(s);
    setTimeout(() => setStatus((c) => (c === s ? '' : c)), 2500);
  };

  const parsed = useMemo(() => parse(st.input, as), [st.input, as]);
  const run = (fn: (v: unknown) => string, label: string) => {
    if (!parsed.ok) return flash('Сначала исправьте ошибку разбора');
    setOutput(fn(parsed.value));
    flash(label);
  };

  // Проверка по схеме
  const validation = useMemo(() => {
    const sch = parse(st.schema, 'auto');
    if (!sch.ok) return { stage: 'schema' as const, error: sch.error };
    const doc = parse(st.doc, 'auto');
    if (!doc.ok) return { stage: 'doc' as const, error: doc.error };
    try {
      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      const validate = ajv.compile(sch.value as object);
      const ok = validate(doc.value);
      return { stage: 'done' as const, ok, errors: validate.errors ?? [] };
    } catch (e) {
      return { stage: 'schema' as const, error: `Схема не компилируется: ${(e as Error).message}` };
    }
  }, [st.schema, st.doc]);

  return (
    <div className="jy not-content">
      <div className="jy__tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'format'} className={tab === 'format' ? 'is-active' : ''} onClick={() => setTab('format')}>
          Формат и конвертация
        </button>
        <button type="button" role="tab" aria-selected={tab === 'schema'} className={tab === 'schema' ? 'is-active' : ''} onClick={() => setTab('schema')}>
          Проверка по JSON Schema
        </button>
      </div>

      {tab === 'format' && (
        <>
          <div className="jy__bar">
            <label>
              Вход:{' '}
              <select value={as} onChange={(e) => setAs(e.target.value as Fmt | 'auto')}>
                <option value="auto">определить автоматически</option>
                <option value="json">JSON</option>
                <option value="yaml">YAML</option>
              </select>
            </label>
            <button type="button" className="sa-btn" onClick={() => update({ input: HIRE })}>
              Пример: событие HIRE
            </button>
            <button type="button" className="sa-btn" onClick={() => update({ input: toYaml(EMPLOYEE_EVENT_EXAMPLES[1].payload) })}>
              Пример: HIRE_CANCELLED в YAML
            </button>
          </div>
          <div className="jy__panes">
            <div className="jy__pane">
              <label htmlFor="jy-in">
                Исходный текст {parsed.ok && <span className="jy__ok">· {parsed.fmt === 'json' ? 'JSON' : 'YAML'}, без ошибок</span>}
              </label>
              <textarea id="jy-in" spellCheck={false} value={st.input} onChange={(e) => update({ input: e.target.value })} />
              {!parsed.ok && parsed.error !== 'Пусто' && <p className="jy__err">{parsed.error}</p>}
            </div>
            <div className="jy__pane">
              <label htmlFor="jy-out">Результат</label>
              <textarea id="jy-out" spellCheck={false} readOnly value={output} placeholder="Выберите действие ниже" />
            </div>
          </div>
          <div className="jy__bar">
            <button type="button" className="sa-btn sa-btn--primary" onClick={() => run((v) => toJson(v), 'Отформатировано как JSON')}>
              Форматировать JSON
            </button>
            <button type="button" className="sa-btn" onClick={() => run((v) => toJson(v, true), 'JSON сжат в одну строку')}>
              Сжать JSON
            </button>
            <button type="button" className="sa-btn" onClick={() => run(toYaml, 'Преобразовано в YAML')}>
              → YAML
            </button>
            <button type="button" className="sa-btn" onClick={() => run((v) => (parsed.fmt === 'yaml' ? toYaml(sortKeys(v)) : toJson(sortKeys(v))), 'Ключи отсортированы')}>
              Сортировать ключи
            </button>
            <button
              type="button"
              className="sa-btn"
              disabled={!output}
              onClick={() => {
                update({ input: output });
                setOutput('');
              }}
            >
              ← Результат во вход
            </button>
            <button type="button" className="sa-btn" disabled={!output} onClick={async () => flash((await copyText(output)) ? 'Скопировано' : 'Не удалось скопировать')}>
              Копировать
            </button>
            <button
              type="button"
              className="sa-btn"
              disabled={!output}
              onClick={() => downloadText(output.trimStart().startsWith('{') || output.trimStart().startsWith('[') ? 'result.json' : 'result.yaml', output)}
            >
              Скачать
            </button>
            <span className="jy__status" aria-live="polite">
              {status}
            </span>
          </div>
        </>
      )}

      {tab === 'schema' && (
        <>
          <div className="jy__bar">
            <button type="button" className="sa-btn" onClick={() => update({ schema: toJson(EMPLOYEE_EVENT_SCHEMA), doc: HIRE })}>
              Пример: корректное событие
            </button>
            <button type="button" className="sa-btn" onClick={() => update({ schema: toJson(EMPLOYEE_EVENT_SCHEMA), doc: toJson(EMPLOYEE_EVENT_BAD) })}>
              Пример: событие с ошибками
            </button>
          </div>
          <div className="jy__panes">
            <div className="jy__pane">
              <label htmlFor="jy-schema">JSON Schema (JSON или YAML)</label>
              <textarea id="jy-schema" spellCheck={false} value={st.schema} onChange={(e) => update({ schema: e.target.value })} />
              {validation.stage === 'schema' && <p className="jy__err">{validation.error}</p>}
            </div>
            <div className="jy__pane">
              <label htmlFor="jy-doc">Документ для проверки (JSON или YAML)</label>
              <textarea id="jy-doc" spellCheck={false} value={st.doc} onChange={(e) => update({ doc: e.target.value })} />
              {validation.stage === 'doc' && <p className="jy__err">{validation.error}</p>}
            </div>
          </div>
          {validation.stage === 'done' && (
            <section className={`jy__result ${validation.ok ? 'is-ok' : 'is-bad'}`} aria-live="polite">
              {validation.ok ? (
                <p>Документ соответствует схеме.</p>
              ) : (
                <>
                  <p>Ошибок: {validation.errors.length}</p>
                  <ul>
                    {validation.errors.map((e, i) => (
                      <li key={i}>
                        <code>{e.instancePath || '(корень)'}</code> — {ruError(e)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
