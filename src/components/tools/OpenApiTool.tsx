import { useEffect, useRef, useState } from 'react';
import YAML from 'yaml';
import { renderRedoc } from '../../lib/redoc';
import { reviewOpenApi, type Review } from '../../lib/openapi-review';
import { load, save } from '../../scripts/storage';
import './OpenApiTool.css';

const CASE_SPECS = [
  { id: 'idm', label: 'API IdM (кейс)', url: '/case-files/idm-joiner-docs/04_integrations/api/idm-api.openapi.yaml' },
  { id: 'abs', label: 'Адаптер АБС (кейс)', url: '/case-files/idm-joiner-docs/04_integrations/api/abs-adapter.openapi.yaml' },
];
const PASTE_KEY = 'openapi-viewer:paste';
const LEVEL_LABEL = { error: 'Ошибка', warn: 'Замечание', info: 'Подсказка' } as const;

type Source = 'idm' | 'abs' | 'file' | 'paste';

/** Разбор текста спецификации: JSON или YAML, с местом ошибки. */
function parseSpec(text: string): { ok: true; doc: unknown } | { ok: false; error: string } {
  const t = text.trimStart();
  if (t.startsWith('{')) {
    try {
      return { ok: true, doc: JSON.parse(text) };
    } catch (e) {
      return { ok: false, error: `JSON: ${(e as Error).message}` };
    }
  }
  const d = YAML.parseDocument(text);
  if (d.errors.length) {
    const p = d.errors[0].linePos?.[0];
    const msg = d.errors[0].message.split('\n')[0].replace(/\s*at line \d+, column \d+:?\s*$/, '');
    return { ok: false, error: `YAML${p ? `, строка ${p.line}, столбец ${p.col}` : ''}: ${msg}` };
  }
  return { ok: true, doc: d.toJS() };
}

/**
 * Просмотрщик OpenAPI: спецификации кейса, свой файл или вставленный текст → ревью-чек и Redoc.
 * Всё в браузере: файл читается через File API и никуда не отправляется.
 */
export default function OpenApiTool() {
  const [source, setSource] = useState<Source>('idm');
  const [paste, setPaste] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [rendering, setRendering] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => setPaste(load<string>(PASTE_KEY, '')), []);

  const show = async (text: string) => {
    setError('');
    setReview(null);
    const parsed = parseSpec(text);
    if (!parsed.ok) {
      setError(parsed.error);
      if (host.current) host.current.innerHTML = '';
      return;
    }
    const rv = reviewOpenApi(parsed.doc);
    setReview(rv);
    if (!host.current) return;
    // Внешние $ref Redoc стал бы загружать по сети — на офлайн-сайте не показываем, а объясняем.
    if (rv.externalRefs.length) {
      host.current.innerHTML = '';
      setError('Документация не показана: в спецификации есть внешние $ref, Redoc попытался бы загрузить их по сети. Соберите спецификацию в один файл (например, командой bundle в Redocly CLI) и откройте снова.');
      return;
    }
    // Свежий контейнер на каждый показ — Redoc рендерит в него своё приложение.
    host.current.innerHTML = '';
    const el = document.createElement('div');
    host.current.append(el);
    setRendering(true);
    try {
      await renderRedoc(parsed.doc as object, el);
    } catch (e) {
      setError(`Redoc не смог показать спецификацию: ${(e as Error).message ?? e}`);
    } finally {
      setRendering(false);
    }
  };

  // Спецификации кейса — по выбору
  useEffect(() => {
    const spec = CASE_SPECS.find((s) => s.id === source);
    if (!spec) return;
    fetch(spec.url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(show)
      .catch((e) => setError(`Не удалось загрузить ${spec.url}: ${e.message}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    await show(await file.text());
  };

  const findings = review ? review.findings.filter((x) => showInfo || x.level !== 'info') : [];
  const infoCount = review ? review.findings.filter((x) => x.level === 'info').length : 0;

  return (
    <div className="oat">
      <div className="oat__sources" role="radiogroup" aria-label="Источник спецификации">
        {(
          [
            ...CASE_SPECS.map((s) => [s.id, s.label]),
            ['file', 'Открыть файл'],
            ['paste', 'Вставить текст'],
          ] as [Source, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="radio" aria-checked={source === id} className={source === id ? 'is-active' : ''} onClick={() => setSource(id)}>
            {label}
          </button>
        ))}
      </div>

      {source === 'file' && (
        <div
          className="oat__drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onFile(e.dataTransfer.files[0]);
          }}
        >
          <label className="sa-btn">
            Выбрать .yaml / .json
            <input type="file" accept=".yaml,.yml,.json,application/json,application/yaml,text/yaml" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <span>{fileName ? `Открыт: ${fileName}` : 'или перетащите файл сюда. Файл читается в браузере и никуда не отправляется.'}</span>
        </div>
      )}

      {source === 'paste' && (
        <div className="oat__paste">
          <textarea
            aria-label="Текст спецификации"
            spellCheck={false}
            placeholder={'openapi: 3.0.3\ninfo:\n  title: …\n  version: 1.0.0\npaths: …'}
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              save(PASTE_KEY, e.target.value);
            }}
          />
          <button type="button" className="sa-btn sa-btn--primary" disabled={!paste.trim()} onClick={() => show(paste)}>
            Показать
          </button>
        </div>
      )}

      {error && <p className="oat__error">{error}</p>}

      {review && (
        <section className="oat__review" aria-live="polite">
          <p className="oat__summary">
            <strong>{review.title ?? 'Без названия'}</strong> · {review.version ?? 'версия OpenAPI не указана'} · путей: {review.paths} · операций:{' '}
            {review.operations}
            {Object.keys(review.byMethod).length > 0 && <> ({Object.entries(review.byMethod).map(([m, n]) => `${m} ${n}`).join(', ')})</>} · схем:{' '}
            {review.schemas}
          </p>
          {findings.length === 0 && !showInfo && infoCount === 0 ? (
            <p className="oat__clean">Ошибок и замечаний нет.</p>
          ) : (
            <>
              <ul className="oat__findings">
                {findings.map((x, i) => (
                  <li key={i} className={`lvl-${x.level}`}>
                    <span className="oat__lvl">{LEVEL_LABEL[x.level]}</span> <code>{x.where}</code> — {x.text}
                  </li>
                ))}
              </ul>
              {findings.length === 0 && <p className="oat__clean">Ошибок и замечаний нет.</p>}
            </>
          )}
          {infoCount > 0 && (
            <label className="oat__toggle">
              <input type="checkbox" checked={showInfo} onChange={(e) => setShowInfo(e.target.checked)} /> показать подсказки ({infoCount})
            </label>
          )}
        </section>
      )}

      {rendering && <p className="oat__status">Отрисовываю документацию…</p>}
      <div className="openapi-viewer__body oat__redoc" ref={host} />
    </div>
  );
}
