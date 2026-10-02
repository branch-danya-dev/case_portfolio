import { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import { ARTIFACT_TEMPLATES, type ArtifactTemplate, type Values } from '../../data/artifact-templates';
import { copyText, downloadText } from '../../lib/share';
import { load, save } from '../../scripts/storage';
import './ArtifactGenerator.css';

const DRAFT_KEY = (id: string) => `artifact-generator:${id}`;
const LAST_KEY = 'artifact-generator:last';

/**
 * Генератор артефактов: форма → Markdown с живым превью и подсказками.
 * Черновик каждого шаблона хранится в localStorage этого браузера.
 */
export default function ArtifactGenerator() {
  const [tplId, setTplId] = useState(ARTIFACT_TEMPLATES[0].id);
  const [values, setValues] = useState<Values>({});
  const [view, setView] = useState<'md' | 'html'>('html');
  const [status, setStatus] = useState('');
  const [ready, setReady] = useState(false);

  const tpl = ARTIFACT_TEMPLATES.find((t) => t.id === tplId)!;

  // Шаблон из #t=…, иначе последний открытый.
  useEffect(() => {
    const fromHash = new URLSearchParams(location.hash.slice(1)).get('t');
    const id = ARTIFACT_TEMPLATES.some((t) => t.id === fromHash) ? fromHash! : load<string>(LAST_KEY, ARTIFACT_TEMPLATES[0].id);
    switchTo(id);
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const switchTo = (id: string) => {
    const t = ARTIFACT_TEMPLATES.find((x) => x.id === id) ?? ARTIFACT_TEMPLATES[0];
    setTplId(t.id);
    setValues(load<Values>(DRAFT_KEY(t.id), {}));
    save(LAST_KEY, t.id);
    history.replaceState(null, '', `#t=${t.id}`);
    setStatus('');
  };

  const update = (patch: Values) => {
    setValues((v) => {
      const next = { ...v, ...patch };
      save(DRAFT_KEY(tplId), next);
      return next;
    });
  };

  const markdown = useMemo(() => tpl.render(values), [tpl, values]);
  const html = useMemo(() => marked.parse(markdown, { async: false }) as string, [markdown]);
  const warnings = useMemo(() => tpl.check(values), [tpl, values]);
  const warnFields = new Set(warnings.map((w) => w.field));

  const flash = (s: string) => {
    setStatus(s);
    setTimeout(() => setStatus((cur) => (cur === s ? '' : cur)), 2500);
  };

  return (
    <div className="artgen" data-ready={ready}>
      <div className="artgen__tabs" role="tablist" aria-label="Шаблон">
        {ARTIFACT_TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tplId}
            className={`artgen__tab${t.id === tplId ? ' is-active' : ''}`}
            onClick={() => switchTo(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="artgen__desc">
        {tpl.description}. <a href={tpl.page}>Как писать</a>
      </p>

      <div className="artgen__panes">
        <form className="artgen__form" onSubmit={(e) => e.preventDefault()}>
          <div className="artgen__formbar">
            <button type="button" className="sa-btn" onClick={() => update({ ...tpl.example })}>
              Заполнить примером из кейса
            </button>
            <button
              type="button"
              className="sa-btn"
              onClick={() => {
                setValues({});
                save(DRAFT_KEY(tplId), {});
              }}
            >
              Очистить
            </button>
          </div>
          {tpl.fields.map((f) => (
            <FieldInput key={f.id} tpl={tpl} field={f} value={values[f.id] ?? ''} flagged={warnFields.has(f.id)} onChange={(val) => update({ [f.id]: val })} />
          ))}
        </form>

        <div className="artgen__out">
          <div className="artgen__outbar">
            <div className="artgen__switch" role="group" aria-label="Вид">
              <button type="button" className={view === 'html' ? 'is-active' : ''} onClick={() => setView('html')}>
                Просмотр
              </button>
              <button type="button" className={view === 'md' ? 'is-active' : ''} onClick={() => setView('md')}>
                Markdown
              </button>
            </div>
            <div className="artgen__actions">
              <button type="button" className="sa-btn sa-btn--primary" onClick={async () => flash((await copyText(markdown)) ? 'Скопировано' : 'Не удалось скопировать')}>
                Копировать
              </button>
              <button type="button" className="sa-btn" onClick={() => downloadText(tpl.filename(values), markdown, 'text/markdown')}>
                Скачать .md
              </button>
            </div>
          </div>
          <p className="artgen__status" aria-live="polite">
            {status}
          </p>
          {view === 'md' ? (
            <pre className="artgen__md">{markdown}</pre>
          ) : (
            <div className="artgen__html" dangerouslySetInnerHTML={{ __html: html }} />
          )}

          <section className="artgen__warn" aria-live="polite">
            <h3>Проверка {warnings.length === 0 ? '— замечаний нет' : `— ${warnings.length}`}</h3>
            {warnings.length > 0 && (
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w.text}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  tpl,
  field,
  value,
  flagged,
  onChange,
}: {
  tpl: ArtifactTemplate;
  field: ArtifactTemplate['fields'][number];
  value: string;
  flagged: boolean;
  onChange: (v: string) => void;
}) {
  const id = `artgen-${tpl.id}-${field.id}`;
  const common = { id, value, placeholder: field.placeholder, 'aria-invalid': flagged || undefined };
  const rows = field.type === 'lines' ? Math.min(Math.max(value.split('\n').length + 1, 4), 14) : 4;
  return (
    <div className={`artgen__field${field.half ? ' is-half' : ''}${flagged ? ' is-flagged' : ''}`}>
      <label htmlFor={id}>{field.label}</label>
      {field.type === 'text' && <input type="text" {...common} onChange={(e) => onChange(e.target.value)} />}
      {(field.type === 'textarea' || field.type === 'lines') && (
        <textarea {...common} rows={field.id === 'gherkin' ? 8 : rows} spellCheck={field.id !== 'gherkin'} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === 'select' && (
        <select id={id} value={value || field.options![0]} onChange={(e) => onChange(e.target.value)}>
          {field.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      )}
      {field.hint && <small>{field.hint}</small>}
    </div>
  );
}
