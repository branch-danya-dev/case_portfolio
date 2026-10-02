import { useEffect, useMemo, useState } from 'react';
import { HEADERS, METHODS, SCENARIOS, STATUSES, type HttpStatus, type Retry } from '../../data/http';
import './HttpReference.css';

type Tab = 'codes' | 'scenarios' | 'methods' | 'headers';
const TABS: { id: Tab; label: string }[] = [
  { id: 'codes', label: 'Коды ответов' },
  { id: 'scenarios', label: 'Какой код вернуть' },
  { id: 'methods', label: 'Методы' },
  { id: 'headers', label: 'Заголовки' },
];
const CLASSES = ['2xx', '3xx', '4xx', '5xx'];
const RETRY_LABEL: Record<Retry, string> = { yes: 'можно повторить', no: 'не повторять', maybe: 'повтор с условием' };

/**
 * Справочник HTTP: коды ответов с поиском и фильтром по классу, ситуации «какой код вернуть»,
 * свойства методов и полезные заголовки. Ссылка #404 открывает карточку кода.
 */
export default function HttpReference() {
  const [tab, setTab] = useState<Tab>('codes');
  const [query, setQuery] = useState('');
  const [cls, setCls] = useState('');
  const [commonOnly, setCommonOnly] = useState(false);
  const [target, setTarget] = useState<number | null>(null);

  // #404 → вкладка кодов, прокрутка к карточке.
  useEffect(() => {
    const go = () => {
      const code = Number(location.hash.slice(1));
      if (STATUSES.some((s) => s.code === code)) {
        setTab('codes');
        setQuery('');
        setCls('');
        setCommonOnly(false);
        setTarget(code);
        requestAnimationFrame(() => document.getElementById(`http-${code}`)?.scrollIntoView({ block: 'center' }));
      }
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, []);

  const q = query.trim().toLowerCase();
  const codes = useMemo(
    () =>
      STATUSES.filter(
        (s) =>
          (!cls || String(s.code)[0] === cls[0]) &&
          (!commonOnly || s.common) &&
          (!q || [s.code, s.name, s.ru, s.when, s.notConfuse, s.retryNote, s.caseExample].join(' ').toLowerCase().includes(q)),
      ),
    [q, cls, commonOnly],
  );
  const headers = useMemo(() => HEADERS.filter((h) => !q || [h.name, h.what, h.note].join(' ').toLowerCase().includes(q)), [q]);
  const scenarios = useMemo(
    () => SCENARIOS.filter((s) => !q || [s.situation, s.note, s.codes.join(' ')].join(' ').toLowerCase().includes(q)),
    [q],
  );
  const methods = useMemo(() => METHODS.filter((m) => !q || [m.method, m.ru, m.when].join(' ').toLowerCase().includes(q)), [q]);

  const codeLink = (c: number) => (
    <a
      key={c}
      href={`#${c}`}
      className="http__code-link"
      onClick={(e) => {
        if (location.hash === `#${c}`) {
          e.preventDefault();
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        }
      }}
    >
      {c}
    </a>
  );

  return (
    <div className="http">
      <div className="http__tabs" role="tablist" aria-label="Раздел справочника">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'is-active' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="http__filter">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Поиск"
          placeholder={tab === 'codes' ? 'Код, название или ситуация: 409, конфликт, идемпотент…' : 'Поиск'}
        />
        {tab === 'codes' && (
          <>
            <div className="http__chips" role="group" aria-label="Класс кодов">
              {['', ...CLASSES].map((c) => (
                <button key={c || 'all'} type="button" className={cls === c ? 'is-active' : ''} onClick={() => setCls(c)}>
                  {c || 'Все'}
                </button>
              ))}
            </div>
            <label className="http__check">
              <input type="checkbox" checked={commonOnly} onChange={(e) => setCommonOnly(e.target.checked)} /> только частые в API
            </label>
          </>
        )}
      </div>

      {tab === 'codes' && (
        <div className="http__cards">
          {codes.map((s) => (
            <StatusCard key={s.code} s={s} highlighted={target === s.code} />
          ))}
          {codes.length === 0 && <p className="http__empty">Ничего не найдено.</p>}
        </div>
      )}

      {tab === 'scenarios' && (
        <div className="http__table-wrap">
          <table className="http__table">
            <thead>
              <tr>
                <th>Ситуация</th>
                <th>Код</th>
                <th>Примечание</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.situation}>
                  <td>{s.situation}</td>
                  <td className="http__nowrap">{s.codes.map((c, i) => [i > 0 && ' или ', codeLink(c)])}</td>
                  <td>{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'methods' && (
        <>
          <div className="http__table-wrap">
            <table className="http__table">
              <thead>
                <tr>
                  <th>Метод</th>
                  <th>Безопасный</th>
                  <th>Идемпотентный</th>
                  <th>Тело запроса</th>
                  <th>Когда</th>
                  <th>Типичные ответы</th>
                </tr>
              </thead>
              <tbody>
                {methods.map((m) => (
                  <tr key={m.method}>
                    <td>
                      <strong>{m.method}</strong>
                      <br />
                      <small>{m.ru}</small>
                    </td>
                    <td className={m.safe ? 'http__yes' : 'http__no'}>{m.safe ? 'да' : 'нет'}</td>
                    <td className={m.idempotent ? 'http__yes' : 'http__no'}>{m.idempotent ? 'да' : 'нет'}</td>
                    <td>{m.requestBody}</td>
                    <td>
                      {m.when}
                      {m.caseExample && <p className="http__case">Кейс: {m.caseExample}</p>}
                    </td>
                    <td className="http__nowrap">
                      {m.responses.split(', ').map((c, i) => [i > 0 && ', ', codeLink(Number(c))])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="http__legend">
            <strong>Безопасный</strong> — не меняет состояние сервера (только чтение). <strong>Идемпотентный</strong> — повтор запроса даёт тот же
            результат на сервере, что и один запрос; такие запросы можно повторять после тайм-аута. POST и PATCH неидемпотентны — для
            безопасных повторов нужен ключ идемпотентности.
          </p>
        </>
      )}

      {tab === 'headers' && (
        <div className="http__table-wrap">
          <table className="http__table">
            <thead>
              <tr>
                <th>Заголовок</th>
                <th>Где</th>
                <th>Зачем</th>
                <th>Пример</th>
              </tr>
            </thead>
            <tbody>
              {headers.map((h) => (
                <tr key={h.name}>
                  <td className="http__nowrap">
                    <code>{h.name}</code>
                  </td>
                  <td>{h.direction}</td>
                  <td>
                    {h.what}
                    {h.note && <p className="http__case">{h.note}</p>}
                  </td>
                  <td>
                    <code className="http__example">{h.example}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusCard({ s, highlighted }: { s: HttpStatus; highlighted: boolean }) {
  return (
    <article id={`http-${s.code}`} className={`http__card http__card--${String(s.code)[0]}xx${highlighted ? ' is-target' : ''}`}>
      <header>
        <span className="http__num">{s.code}</span>
        <span>
          <strong>{s.name}</strong>
          <br />
          <small>{s.ru}</small>
        </span>
      </header>
      <p>{s.when}</p>
      {s.notConfuse && (
        <p className="http__nc">
          <strong>Не путать:</strong> {s.notConfuse}
        </p>
      )}
      {s.caseExample && <p className="http__case">Кейс: {s.caseExample}</p>}
      <footer>
        <span className={`http__retry http__retry--${s.retry}`} title={s.retryNote}>
          {RETRY_LABEL[s.retry]}
        </span>
        {s.retryNote && <small>{s.retryNote}</small>}
        <small className="http__rfc">{s.rfc}</small>
      </footer>
    </article>
  );
}
