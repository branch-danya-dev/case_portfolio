import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { copyText, downloadText } from '../../lib/share';
import { load, save } from '../../scripts/storage';
import './Prioritization.css';

// ---------- MoSCoW ----------
type Cat = 'M' | 'S' | 'C' | 'W' | '';
const COLUMNS: { id: Cat; label: string; hint: string }[] = [
  { id: 'M', label: 'Must', hint: 'без этого релиз не имеет смысла' },
  { id: 'S', label: 'Should', hint: 'важно, но есть обходной путь' },
  { id: 'C', label: 'Could', hint: 'желательно, если останется время' },
  { id: 'W', label: "Won't (сейчас)", hint: 'явно не делаем в этом релизе' },
  { id: '', label: 'Без категории', hint: 'ещё не разобрано' },
];
interface Card {
  id: string;
  title: string;
  cat: Cat;
}
/** Бизнес-требования кейса с приоритетами из 04_business-requirements.md (названия сокращены). */
const CASE_CARDS: Card[] = [
  { id: 'BR-01', title: 'Запуск по кадровому событию, без заявки руководителя', cat: 'M' },
  { id: 'BR-02', title: 'Базовый набор доступов для всех', cat: 'M' },
  { id: 'BR-03', title: 'Доступы по должности и подразделению', cat: 'M' },
  { id: 'BR-04', title: 'Готовы к первому дню, не активны до него', cat: 'M' },
  { id: 'BR-05', title: 'Запрос дополнительных доступов с согласованием', cat: 'M' },
  { id: 'BR-06', title: 'Конфликтующие полномочия исключены или согласованы ИБ', cat: 'M' },
  { id: 'BR-07', title: 'Изменения до выхода отражаются на доступах', cat: 'M' },
  { id: 'BR-08', title: 'Все операции фиксируются для аудита', cat: 'M' },
  { id: 'BR-09', title: 'Первичные учётные данные — безопасным способом', cat: 'M' },
  { id: 'BR-10', title: 'Задача исполнителю для систем без подключения', cat: 'S' },
  { id: 'BR-11', title: 'Руководитель видит статус подготовки доступов', cat: 'C' },
  { id: 'BR-12', title: 'Перевод и увольнение (волна 2)', cat: 'W' },
];

// ---------- RICE ----------
interface RiceRow {
  name: string;
  reach: string;
  impact: string;
  confidence: string;
  effort: string;
}
const IMPACT = [
  { v: '3', l: '3 — огромное' },
  { v: '2', l: '2 — большое' },
  { v: '1', l: '1 — среднее' },
  { v: '0.5', l: '0,5 — малое' },
  { v: '0.25', l: '0,25 — минимальное' },
];
const CONFIDENCE = [
  { v: '100', l: '100% — высокая' },
  { v: '80', l: '80% — средняя' },
  { v: '50', l: '50% — низкая' },
];
/** Иллюстративные оценки со страницы «Приоритизация». */
const RICE_DEFAULT: RiceRow[] = [
  { name: 'Напоминание согласующему через 4 часа', reach: '40', impact: '2', confidence: '50', effort: '0,5' },
  { name: 'Статус подготовки доступов для руководителя (BR-11)', reach: '120', impact: '1', confidence: '80', effort: '2' },
  { name: 'Коннектор СЭД вместо ручных задач', reach: '120', impact: '2', confidence: '80', effort: '6' },
];

// ---------- WSJF ----------
interface WsjfRow {
  name: string;
  value: number;
  time: number;
  risk: number;
  size: number;
}
const FIB = [1, 2, 3, 5, 8, 13, 20];
const WSJF_DEFAULT: WsjfRow[] = [
  { name: 'EPIC-06 Аудит и отчётность', value: 1, time: 8, risk: 13, size: 1 },
  { name: 'EPIC-03 Провижининг', value: 20, time: 13, risk: 8, size: 13 },
  { name: 'EPIC-04 Портал заявок', value: 8, time: 1, risk: 1, size: 5 },
];

const num = (s: string) => Number.parseFloat(String(s).replace(',', '.'));
const fmt = (x: number, d = 1) => (Number.isFinite(x) ? x.toLocaleString('ru-RU', { maximumFractionDigits: d }) : '—');
const esc = (s: string) => s.replace(/\|/g, '\\|');

type Tab = 'moscow' | 'rice' | 'wsjf';

/** Приоритизация: доска MoSCoW, скоринг RICE и WSJF. Данные — только в localStorage этого браузера. */
export default function Prioritization() {
  const [tab, setTab] = useState<Tab>('moscow');
  const [cards, setCards] = useState<Card[]>(CASE_CARDS);
  const [rice, setRice] = useState<RiceRow[]>(RICE_DEFAULT);
  const [wsjf, setWsjf] = useState<WsjfRow[]>(WSJF_DEFAULT);
  const [status, setStatus] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Cat | null>(null);

  useEffect(() => {
    setCards(load('prioritization:moscow', CASE_CARDS));
    setRice(load('prioritization:rice', RICE_DEFAULT));
    setWsjf(load('prioritization:wsjf', WSJF_DEFAULT));
  }, []);
  const putCards = (c: Card[]) => (setCards(c), save('prioritization:moscow', c));
  const putRice = (r: RiceRow[]) => (setRice(r), save('prioritization:rice', r));
  const putWsjf = (w: WsjfRow[]) => (setWsjf(w), save('prioritization:wsjf', w));

  const flash = (s: string) => {
    setStatus(s);
    setTimeout(() => setStatus((c) => (c === s ? '' : c)), 2500);
  };

  // ---------- MoSCoW: действия ----------
  const moveCard = (id: string, cat: Cat) => putCards(cards.map((c) => (c.id === id ? { ...c, cat } : c)));
  const onDrop = (cat: Cat) => (e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id) moveCard(id, cat);
    setDragId(null);
    setOver(null);
  };
  const addCard = () => {
    const title = newTitle.trim();
    if (!title) return;
    const n = cards.reduce((m, c) => Math.max(m, Number(c.id.match(/(\d+)$/)?.[1] ?? 0)), 0) + 1;
    putCards([...cards, { id: `REQ-${String(n).padStart(2, '0')}`, title, cat: '' }]);
    setNewTitle('');
  };
  const counts = useMemo(() => Object.fromEntries(COLUMNS.map((c) => [c.id, cards.filter((x) => x.cat === c.id).length])), [cards]);
  const categorized = cards.length - counts[''];
  const mustShare = categorized ? counts.M / categorized : 0;

  const moscowMd = () =>
    ['| ID | Требование | Приоритет |', '|---|---|---|', ...COLUMNS.flatMap((col) => cards.filter((c) => c.cat === col.id).map((c) => `| ${c.id} | ${esc(c.title)} | ${col.id || '—'} |`))].join('\n') + '\n';

  // ---------- RICE ----------
  const riceCalc = useMemo(
    () =>
      rice
        .map((r, i) => ({ ...r, i, score: (num(r.reach) * num(r.impact) * (num(r.confidence) / 100)) / num(r.effort) }))
        .map((r) => ({ ...r, score: Number.isFinite(r.score) ? r.score : NaN })),
    [rice],
  );
  const riceRank = [...riceCalc].sort((a, b) => (b.score || 0) - (a.score || 0)).map((r) => r.i);
  const riceMd = () =>
    [
      '| Место | Улучшение | Reach | Impact | Confidence | Effort | RICE |',
      '|---|---|---|---|---|---|---|',
      ...riceRank.map((i, k) => {
        const r = riceCalc[i];
        return `| ${k + 1} | ${esc(r.name)} | ${r.reach} | ${String(r.impact).replace('.', ',')} | ${r.confidence}% | ${r.effort} | ${fmt(r.score)} |`;
      }),
    ].join('\n') + '\n';

  // ---------- WSJF ----------
  const wsjfCalc = wsjf.map((r, i) => ({ ...r, i, cod: r.value + r.time + r.risk, score: (r.value + r.time + r.risk) / r.size }));
  const wsjfRank = [...wsjfCalc].sort((a, b) => b.score - a.score).map((r) => r.i);
  const noOne = (['value', 'time', 'risk', 'size'] as const).filter((k) => wsjf.length > 1 && !wsjf.some((r) => r[k] === 1));
  const WSJF_COL: Record<string, string> = { value: 'Ценность', time: 'Критичность по времени', risk: 'Риск / возможности', size: 'Размер' };
  const wsjfMd = () =>
    [
      '| Место | Работа | Ценность | Время | Риск / возможности | CoD | Размер | WSJF |',
      '|---|---|---|---|---|---|---|---|',
      ...wsjfRank.map((i, k) => {
        const r = wsjfCalc[i];
        return `| ${k + 1} | ${esc(r.name)} | ${r.value} | ${r.time} | ${r.risk} | ${r.cod} | ${r.size} | ${fmt(r.score)} |`;
      }),
    ].join('\n') + '\n';

  const exportBar = (md: () => string, file: string, reset: () => void) => (
    <div className="prio__bar">
      <button type="button" className="sa-btn" onClick={async () => flash((await copyText(md())) ? 'Таблица Markdown скопирована' : 'Не удалось скопировать')}>
        Копировать Markdown
      </button>
      <button type="button" className="sa-btn" onClick={() => downloadText(file, md(), 'text/markdown')}>
        Скачать .md
      </button>
      <button type="button" className="sa-btn" onClick={reset}>
        Вернуть пример
      </button>
      <span className="prio__status" aria-live="polite">
        {status}
      </span>
    </div>
  );

  return (
    <div className="prio">
      <div className="prio__tabs" role="tablist">
        {(
          [
            ['moscow', 'MoSCoW'],
            ['rice', 'RICE'],
            ['wsjf', 'WSJF'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'moscow' && (
        <>
          <p className="prio__note">
            Перетащите карточку в колонку или выберите категорию в списке на карточке (удобно с клавиатуры). По умолчанию — бизнес-требования кейса
            IDM-JOINER с их приоритетами.
          </p>
          <div className="prio__board">
            {COLUMNS.map((col) => (
              <section
                key={col.id || 'none'}
                className={`prio__col prio__col--${col.id || 'none'}${over === col.id ? ' is-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOver(col.id);
                }}
                onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
                onDrop={onDrop(col.id)}
                aria-label={col.label}
              >
                <header>
                  <strong>{col.label}</strong> <span className="prio__count">{counts[col.id]}</span>
                  <small>{col.hint}</small>
                </header>
                {cards
                  .filter((c) => c.cat === col.id)
                  .map((c) => (
                    <article
                      key={c.id}
                      className={`prio__card${dragId === c.id ? ' is-dragging' : ''}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', c.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDragId(c.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                    >
                      <span className="prio__id">{c.id}</span>
                      <span className="prio__title">{c.title}</span>
                      <span className="prio__cardbar">
                        <select aria-label={`Категория ${c.id}`} value={c.cat} onChange={(e) => moveCard(c.id, e.target.value as Cat)}>
                          {COLUMNS.map((o) => (
                            <option key={o.id || 'none'} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <button type="button" className="prio__del" aria-label={`Удалить ${c.id}`} onClick={() => putCards(cards.filter((x) => x.id !== c.id))}>
                          ×
                        </button>
                      </span>
                    </article>
                  ))}
              </section>
            ))}
          </div>
          <form
            className="prio__add"
            onSubmit={(e) => {
              e.preventDefault();
              addCard();
            }}
          >
            <input aria-label="Новое требование" placeholder="Новое требование" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <button type="submit" className="sa-btn">
              Добавить
            </button>
          </form>
          <ul className="prio__checks">
            {categorized > 0 && mustShare > 0.6 && (
              <li>
                Must — {counts.M} из {categorized} ({fmt(mustShare * 100, 0)} %). Если почти всё «обязательно», категории не помогают выбирать: в
                DSDM рекомендуют держать Must в пределах примерно 60 % трудозатрат, чтобы оставался запас на риски. Здесь считается по числу
                карточек, а не по трудозатратам.
              </li>
            )}
            {categorized > 0 && counts.W === 0 && <li>Колонка Won't пуста — явно зафиксируйте, что не делаем сейчас, иначе это всплывёт как «забыли».</li>}
            {counts[''] > 0 && <li>Без категории: {counts['']} — разберите до согласования.</li>}
          </ul>
          {exportBar(moscowMd, 'moscow.md', () => putCards(CASE_CARDS))}
        </>
      )}

      {tab === 'rice' && (
        <>
          <p className="prio__note">
            <strong>RICE = Reach × Impact × Confidence / Effort.</strong> Reach — охват за период, Impact — влияние на каждого по шкале, Confidence —
            уверенность в оценках, Effort — трудозатраты (например, человеко-месяцы). Пример — иллюстративные оценки со страницы «Приоритизация».
          </p>
          <div className="prio__table-wrap">
            <table className="prio__table">
              <thead>
                <tr>
                  <th>Место</th>
                  <th>Улучшение</th>
                  <th>Reach</th>
                  <th>Impact</th>
                  <th>Confidence</th>
                  <th>Effort</th>
                  <th>RICE</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {riceCalc.map((r) => {
                  const set = (patch: Partial<RiceRow>) => putRice(rice.map((x, j) => (j === r.i ? { ...x, ...patch } : x)));
                  return (
                    <tr key={r.i}>
                      <td className="prio__rank">{riceRank.indexOf(r.i) + 1}</td>
                      <td>
                        <input aria-label="Улучшение" value={r.name} onChange={(e) => set({ name: e.target.value })} />
                      </td>
                      <td>
                        <input aria-label="Reach" inputMode="decimal" className="prio__num" value={r.reach} onChange={(e) => set({ reach: e.target.value })} />
                      </td>
                      <td>
                        <select aria-label="Impact" value={r.impact} onChange={(e) => set({ impact: e.target.value })}>
                          {IMPACT.map((o) => (
                            <option key={o.v} value={o.v}>
                              {o.l}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select aria-label="Confidence" value={r.confidence} onChange={(e) => set({ confidence: e.target.value })}>
                          {CONFIDENCE.map((o) => (
                            <option key={o.v} value={o.v}>
                              {o.l}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input aria-label="Effort" inputMode="decimal" className="prio__num" value={r.effort} onChange={(e) => set({ effort: e.target.value })} />
                      </td>
                      <td className="prio__score">{fmt(r.score)}</td>
                      <td>
                        <button type="button" className="prio__del" aria-label="Удалить строку" onClick={() => putRice(rice.filter((_, j) => j !== r.i))}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="sa-btn prio__addrow" onClick={() => putRice([...rice, { name: 'Новое улучшение', reach: '100', impact: '1', confidence: '80', effort: '1' }])}>
            Добавить строку
          </button>
          <ul className="prio__checks">
            {rice.some((r) => r.confidence === '100') && <li>Confidence 100 % — оценки действительно подтверждены данными? Иначе скоринг выглядит точнее, чем есть.</li>}
            <li>Обязательные требования (регулятор, ИБ) не скорят — они идут вне очереди.</li>
          </ul>
          {exportBar(riceMd, 'rice.md', () => putRice(RICE_DEFAULT))}
        </>
      )}

      {tab === 'wsjf' && (
        <>
          <p className="prio__note">
            <strong>WSJF = Cost of Delay / Job Size</strong>, где Cost of Delay = ценность для бизнеса + критичность по времени + снижение риска / новые
            возможности. Оценки относительные, по ряду 1, 2, 3, 5, 8, 13, 20: самой «маленькой» работе в каждом столбце — 1. Пример — иллюстративные
            оценки со страницы «Приоритизация».
          </p>
          <div className="prio__table-wrap">
            <table className="prio__table">
              <thead>
                <tr>
                  <th>Место</th>
                  <th>Работа</th>
                  <th>Ценность</th>
                  <th>Время</th>
                  <th>Риск / возможности</th>
                  <th>CoD</th>
                  <th>Размер</th>
                  <th>WSJF</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {wsjfCalc.map((r) => {
                  const set = (patch: Partial<WsjfRow>) => putWsjf(wsjf.map((x, j) => (j === r.i ? { ...x, ...patch } : x)));
                  const sel = (k: 'value' | 'time' | 'risk' | 'size') => (
                    <select aria-label={WSJF_COL[k]} value={r[k]} onChange={(e) => set({ [k]: Number(e.target.value) })}>
                      {FIB.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  );
                  return (
                    <tr key={r.i}>
                      <td className="prio__rank">{wsjfRank.indexOf(r.i) + 1}</td>
                      <td>
                        <input aria-label="Работа" value={r.name} onChange={(e) => set({ name: e.target.value })} />
                      </td>
                      <td>{sel('value')}</td>
                      <td>{sel('time')}</td>
                      <td>{sel('risk')}</td>
                      <td>{r.cod}</td>
                      <td>{sel('size')}</td>
                      <td className="prio__score">{fmt(r.score)}</td>
                      <td>
                        <button type="button" className="prio__del" aria-label="Удалить строку" onClick={() => putWsjf(wsjf.filter((_, j) => j !== r.i))}>
                          ×
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="sa-btn prio__addrow" onClick={() => putWsjf([...wsjf, { name: 'Новая работа', value: 1, time: 1, risk: 1, size: 1 }])}>
            Добавить строку
          </button>
          <ul className="prio__checks">
            {noOne.length > 0 && (
              <li>
                Ни у одной работы нет 1 в столбце: {noOne.map((k) => `«${WSJF_COL[k]}»`).join(', ')}. Оценки относительные — начните с самой маленькой и
                поставьте ей 1.
              </li>
            )}
            {wsjfRank.length > 1 && (
              <li>
                Первой идёт «{wsjfCalc[wsjfRank[0]].name}» — больше всего стоимости задержки на единицу размера, даже если её ценность не самая высокая.
              </li>
            )}
          </ul>
          {exportBar(wsjfMd, 'wsjf.md', () => putWsjf(WSJF_DEFAULT))}
        </>
      )}
    </div>
  );
}
