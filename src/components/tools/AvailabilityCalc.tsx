import { useEffect, useMemo, useState } from 'react';
import { load, save } from '../../scripts/storage';
import './AvailabilityCalc.css';

const DAY = 24 * 3600;
/** Периоды в секундах. Год — 365 дней, месяц — 30 дней (как в таблице на странице НФТ). */
const PERIODS = [
  { id: 'day', label: 'День', s: DAY },
  { id: 'week', label: 'Неделя', s: 7 * DAY },
  { id: 'month', label: 'Месяц (30 дней)', s: 30 * DAY },
  { id: 'quarter', label: 'Квартал (¼ года)', s: (365 / 4) * DAY },
  { id: 'year', label: 'Год (365 дней)', s: 365 * DAY },
] as const;
const PRESETS = ['99', '99,5', '99,9', '99,95', '99,99'];
const CHAIN_KEY = 'availability:chain';

interface Schedule {
  hoursPerDay: number;
  daysPerWeek: number;
}
interface ChainItem {
  name: string;
  pct: string;
  copies: string;
}

/** «99,5» → 99.5; пусто или мусор → NaN. */
const num = (s: string) => Number.parseFloat(s.replace(',', '.').replace(/\s/g, ''));
const fmtPct = (x: number, digits = 4) =>
  Number.isFinite(x) ? `${x.toLocaleString('ru-RU', { maximumFractionDigits: digits })} %` : '—';

/** Человекочитаемая длительность: 3 ч 39 мин, 52 мин 36 с. */
function fmtDuration(raw: number): string {
  if (!Number.isFinite(raw) || raw < 0) return '—';
  if (raw < 1) return 'меньше секунды';
  // Округляем до секунды, а длительности от часа — до минуты, чтобы 795,99 ч не превращались в «3 ч 59 мин».
  const sec = raw >= 3600 ? Math.round(raw / 60) * 60 : Math.round(raw);
  const d = Math.floor(sec / DAY);
  const h = Math.floor((sec % DAY) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} дн`);
  if (h) parts.push(`${h} ч`);
  if (m) parts.push(`${m} мин`);
  if (s && d === 0 && h === 0) parts.push(`${s} с`);
  return parts.join(' ') || '0 с';
}

const DEFAULT_CHAIN: ChainItem[] = [
  { name: 'Балансировщик', pct: '99,99', copies: '1' },
  { name: 'Сервис (экземпляр)', pct: '99,5', copies: '2' },
  { name: 'База данных', pct: '99,9', copies: '1' },
  { name: 'Брокер сообщений', pct: '99,9', copies: '1' },
];

/**
 * Калькулятор доступности: процент ↔ простой с учётом окна обслуживания, доступность цепочки
 * последовательных компонентов с резервированием, связь с MTBF и MTTR.
 */
export default function AvailabilityCalc() {
  // ---- процент → простой
  const [pct, setPct] = useState('99,5');
  const [mode, setMode] = useState<'24x7' | 'custom'>('24x7');
  const [sched, setSched] = useState<Schedule>({ hoursPerDay: 12, daysPerWeek: 5 });
  const share = mode === '24x7' ? 1 : (Math.min(Math.max(sched.hoursPerDay, 0), 24) * Math.min(Math.max(sched.daysPerWeek, 0), 7)) / 168;
  const a = num(pct) / 100;
  const pctValid = a > 0 && a <= 1;

  // ---- простой → процент
  const [down, setDown] = useState('3,6');
  const [downUnit, setDownUnit] = useState<'min' | 'h'>('h');
  const [downPeriod, setDownPeriod] = useState<(typeof PERIODS)[number]['id']>('month');
  const downSec = num(down) * (downUnit === 'h' ? 3600 : 60);
  const periodSec = PERIODS.find((p) => p.id === downPeriod)!.s * share;
  const backPct = (1 - downSec / periodSec) * 100;

  // ---- цепочка
  const [chain, setChain] = useState<ChainItem[]>(DEFAULT_CHAIN);
  useEffect(() => setChain(load<ChainItem[]>(CHAIN_KEY, DEFAULT_CHAIN)), []);
  const updateChain = (next: ChainItem[]) => {
    setChain(next);
    save(CHAIN_KEY, next);
  };
  const chainCalc = useMemo(() => {
    const rows = chain.map((c) => {
      const ai = num(c.pct) / 100;
      const n = Math.max(1, Math.floor(num(c.copies) || 1));
      const eff = ai > 0 && ai <= 1 ? 1 - (1 - ai) ** n : NaN;
      return { ...c, eff };
    });
    const total = rows.reduce((p, r) => p * r.eff, 1);
    const weakest = rows.reduce<number>((w, r, i) => (Number.isFinite(r.eff) && (w < 0 || r.eff < rows[w].eff) ? i : w), -1);
    return { rows, total, weakest };
  }, [chain]);

  // ---- MTBF / MTTR
  const [mtbf, setMtbf] = useState('720');
  const [mttr, setMttr] = useState('4');
  const mtbfH = num(mtbf);
  const mttrH = num(mttr);
  const fromM = (mtbfH / (mtbfH + mttrH)) * 100;
  const needMtbf = pctValid ? (a * mttrH) / (1 - a) : NaN;

  return (
    <div className="avail not-content">
      <section className="avail__card">
        <h2>Процент → допустимый простой</h2>
        <div className="avail__row">
          <label>
            Доступность, %
            <input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} aria-invalid={!pctValid || undefined} />
          </label>
          <div className="avail__presets" role="group" aria-label="Типовые значения">
            {PRESETS.map((p) => (
              <button key={p} type="button" className={p === pct ? 'is-active' : ''} onClick={() => setPct(p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <fieldset className="avail__row avail__sched">
          <legend>Когда измеряется доступность</legend>
          <label>
            <input type="radio" name="avail-mode" checked={mode === '24x7'} onChange={() => setMode('24x7')} /> круглосуточно (24×7)
          </label>
          <label>
            <input type="radio" name="avail-mode" checked={mode === 'custom'} onChange={() => setMode('custom')} /> в часы обслуживания:
          </label>
          <label className="avail__inline">
            <input
              type="number"
              min={1}
              max={24}
              value={sched.hoursPerDay}
              disabled={mode !== 'custom'}
              onChange={(e) => setSched({ ...sched, hoursPerDay: Number(e.target.value) })}
            />{' '}
            ч в день ×
          </label>
          <label className="avail__inline">
            <input
              type="number"
              min={1}
              max={7}
              value={sched.daysPerWeek}
              disabled={mode !== 'custom'}
              onChange={(e) => setSched({ ...sched, daysPerWeek: Number(e.target.value) })}
            />{' '}
            дн в неделю
          </label>
        </fieldset>
        <table className="avail__table">
          <thead>
            <tr>
              <th>Период</th>
              <th>Время обслуживания</th>
              <th>Допустимый простой</th>
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p.id}>
                <td>{p.label}</td>
                <td>{fmtDuration(p.s * share)}</td>
                <td>
                  <strong>{pctValid ? fmtDuration(p.s * share * (1 - a)) : '—'}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!pctValid && <p className="avail__err">Введите число больше 0 и не больше 100.</p>}
        {mode === 'custom' && (
          <p className="avail__note">
            Простой вне часов обслуживания не учитывается — поэтому при том же проценте допустимого простоя меньше, чем при 24×7. Время обслуживания —
            доля {fmtPct(share * 100, 1)} календарного времени.
          </p>
        )}
      </section>

      <section className="avail__card">
        <h2>Простой → процент</h2>
        <div className="avail__row">
          <label>
            Простой
            <input inputMode="decimal" value={down} onChange={(e) => setDown(e.target.value)} />
          </label>
          <label>
            Единицы
            <select value={downUnit} onChange={(e) => setDownUnit(e.target.value as 'min' | 'h')}>
              <option value="min">минуты</option>
              <option value="h">часы</option>
            </select>
          </label>
          <label>
            За период
            <select value={downPeriod} onChange={(e) => setDownPeriod(e.target.value as typeof downPeriod)}>
              {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="avail__result">
          Доступность: <strong>{downSec >= 0 && downSec <= periodSec ? fmtPct(backPct) : '—'}</strong>
          {mode === 'custom' && <small> (в часы обслуживания из блока выше)</small>}
        </p>
      </section>

      <section className="avail__card">
        <h2>Доступность цепочки</h2>
        <p className="avail__note">
          Запрос проходит через все компоненты по очереди: общая доступность — произведение доступностей. Несколько копий компонента работают
          параллельно: компонент недоступен, только если отказали все копии. Расчёт предполагает, что отказы независимы, — общая сеть, общий
          дата-центр или общая ошибка в коде делают реальную картину хуже.
        </p>
        <div className="avail__table-wrap">
          <table className="avail__table">
            <thead>
              <tr>
                <th>Компонент</th>
                <th>Доступность одной копии, %</th>
                <th>Копий</th>
                <th>С учётом копий</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {chainCalc.rows.map((r, i) => (
                <tr key={i} className={i === chainCalc.weakest && chain.length > 1 ? 'is-weak' : ''}>
                  <td>
                    <input aria-label="Компонент" value={r.name} onChange={(e) => updateChain(chain.map((c, j) => (j === i ? { ...c, name: e.target.value } : c)))} />
                  </td>
                  <td>
                    <input
                      aria-label="Доступность, %"
                      inputMode="decimal"
                      value={r.pct}
                      onChange={(e) => updateChain(chain.map((c, j) => (j === i ? { ...c, pct: e.target.value } : c)))}
                    />
                  </td>
                  <td>
                    <input
                      aria-label="Копий"
                      type="number"
                      min={1}
                      max={9}
                      value={r.copies}
                      onChange={(e) => updateChain(chain.map((c, j) => (j === i ? { ...c, copies: e.target.value } : c)))}
                    />
                  </td>
                  <td>{fmtPct(r.eff * 100)}</td>
                  <td>
                    <button type="button" className="avail__del" aria-label={`Удалить ${r.name}`} onClick={() => updateChain(chain.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="avail__actions">
          <button type="button" className="sa-btn" onClick={() => updateChain([...chain, { name: 'Компонент', pct: '99,9', copies: '1' }])}>
            Добавить компонент
          </button>
          <button type="button" className="sa-btn" onClick={() => updateChain(DEFAULT_CHAIN)}>
            Пример по умолчанию
          </button>
        </div>
        <p className="avail__result">
          Общая доступность: <strong>{chain.length ? fmtPct(chainCalc.total * 100) : '—'}</strong>
          {chain.length > 0 && Number.isFinite(chainCalc.total) && (
            <>
              {' '}
              · простой в месяц (30 дней) до <strong>{fmtDuration(30 * DAY * (1 - chainCalc.total))}</strong>
            </>
          )}
        </p>
        {chainCalc.weakest >= 0 && chain.length > 1 && (
          <p className="avail__note">
            Слабое звено — <strong>{chain[chainCalc.weakest].name}</strong>. Общая доступность цепочки всегда ниже, чем у самого слабого компонента.
          </p>
        )}
      </section>

      <section className="avail__card">
        <h2>MTBF и MTTR</h2>
        <p className="avail__note">Доступность = MTBF / (MTBF + MTTR): среднее время между отказами и среднее время восстановления.</p>
        <div className="avail__row">
          <label>
            MTBF, ч
            <input inputMode="decimal" value={mtbf} onChange={(e) => setMtbf(e.target.value)} />
          </label>
          <label>
            MTTR, ч
            <input inputMode="decimal" value={mttr} onChange={(e) => setMttr(e.target.value)} />
          </label>
        </div>
        <p className="avail__result">
          Доступность: <strong>{mtbfH > 0 && mttrH >= 0 ? fmtPct(fromM) : '—'}</strong>
        </p>
        <p className="avail__result">
          Чтобы получить {pctValid ? fmtPct(a * 100) : 'доступность из первого блока'} при MTTR {mttrH > 0 ? `${mttr} ч` : '—'}, отказы должны случаться не чаще
          чем раз в <strong>{mttrH > 0 && Number.isFinite(needMtbf) ? fmtDuration(needMtbf * 3600) : '—'}</strong>.
        </p>
      </section>
    </div>
  );
}
