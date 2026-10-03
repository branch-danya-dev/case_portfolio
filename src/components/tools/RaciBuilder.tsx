import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { copyText, downloadText } from '../../lib/share';
import { load, save } from '../../scripts/storage';
import './RaciBuilder.css';

type Val = '' | 'R' | 'A' | 'R/A' | 'C' | 'I';
const CYCLE: Val[] = ['', 'R', 'A', 'R/A', 'C', 'I'];
interface Matrix {
  roles: string[];
  rows: { name: string; cells: Val[] }[];
}

const CASE_ROLES = ['РП', 'БА', 'СА', 'Архитектор', 'ИБ', 'Разработка', 'QA', 'Заказчик'];
const r = (name: string, s: string): Matrix['rows'][number] => ({ name, cells: s.split(' ') as Val[] });
/** Матрица RACI кейса (00_project/02_stakeholders-raci.md, раздел 3). */
const CASE: Matrix = {
  roles: CASE_ROLES,
  rows: [
    r('Устав', 'R C C C C I I A'),
    r('Реестр стейкхолдеров', 'R/A C C I I I I I'),
    r('AS-IS / TO-BE', 'I R C I C I I A'),
    r('Бизнес-требования', 'I R C I C I I A'),
    r('Функциональные требования', 'I C R C C C C A'),
    r('Нефункциональные требования', 'I I R A C C C I'),
    r('Use case / бэклог', 'I C R I I C C A'),
    r('Ролевая модель', 'I C R I A I I C'),
    r('Модель данных, статусные модели', 'I I R A I C I I'),
    r('Контекст и контейнеры (C4)', 'I I C R/A C C I I'),
    r('Интеграции, API, маппинг', 'I I R A C C C I'),
    r('ADR', 'I I C R/A C C I I'),
    r('Требования ИБ', 'I I C C R/A I I I'),
    r('Стратегия миграции, план внедрения', 'A C R C C C C I'),
    r('ПМИ и тест-кейсы', 'I I C I C I R A'),
  ],
};
const EMPTY: Matrix = {
  roles: ['Роль 1', 'Роль 2', 'Роль 3'],
  rows: [
    { name: 'Артефакт или работа 1', cells: ['', '', ''] },
    { name: 'Артефакт или работа 2', cells: ['', '', ''] },
  ],
};
const KEY = 'raci';

const hasA = (v: Val) => v === 'A' || v === 'R/A';
const hasR = (v: Val) => v === 'R' || v === 'R/A';

interface Problem {
  level: 'error' | 'warn' | 'info';
  text: string;
}

function check(m: Matrix): { rows: Problem[][]; cols: Problem[][]; total: Problem[] } {
  const n = m.roles.length;
  const rows = m.rows.map((row) => {
    const p: Problem[] = [];
    const a = row.cells.filter(hasA).length;
    const rr = row.cells.filter(hasR).length;
    const c = row.cells.filter((v) => v === 'C').length;
    if (a === 0) p.push({ level: 'error', text: 'Нет A — никто не отвечает за результат' });
    if (a > 1) p.push({ level: 'error', text: `${a} A — непонятно, чьё решение окончательное; второму — C` });
    if (rr === 0) p.push({ level: 'error', text: 'Нет R — работа «общая», значит ничья' });
    if (n >= 4 && c > n / 2) p.push({ level: 'warn', text: `C у ${c} из ${n} ролей — каждое решение будет долгим кругом согласований` });
    return p;
  });
  const cols = m.roles.map((role, j) => {
    const p: Problem[] = [];
    const vals = m.rows.map((row) => row.cells[j]);
    if (m.rows.length && vals.every((v) => v === '' || v === 'I'))
      p.push({ level: 'info', text: 'Только I или пусто — роль точно нужна в матрице?' });
    const a = vals.filter(hasA).length;
    if (m.rows.length >= 4 && a / m.rows.length > 0.5) p.push({ level: 'warn', text: `A в ${a} из ${m.rows.length} строк — узкое место согласований` });
    if (/^[А-ЯЁA-Z][а-яёa-z]+\s+[А-ЯЁA-Z]\.\s?([А-ЯЁA-Z]\.)?$/.test(role.trim()) || /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+$/.test(role.trim()))
      p.push({ level: 'warn', text: 'Похоже на фамилию — в матрице роли, люди — в реестре стейкхолдеров' });
    return p;
  });
  const total: Problem[] = [];
  const cells = m.rows.flatMap((row) => row.cells);
  const filled = cells.filter((v) => v !== '').length;
  if (cells.length >= 16 && filled / cells.length > 0.9)
    total.push({ level: 'info', text: 'Матрица заполнена почти целиком — всем ли нужны I «на всякий случай»? Пустая ячейка допустима' });
  if (!m.roles.some((x) => /ИБ|безопасн/i.test(x)) && m.roles.length >= 4)
    total.push({ level: 'info', text: 'Нет ИБ среди ролей — в банке её вето в конце проекта обходится дорого' });
  return { rows, cols, total };
}

const esc = (s: string) => s.replace(/\|/g, '\\|');
const csvCell = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Конструктор RACI: роли × артефакты, проверка правил, экспорт Markdown и CSV. Хранится в localStorage. */
export default function RaciBuilder() {
  const [m, setM] = useState<Matrix>(CASE);
  const [status, setStatus] = useState('');
  useEffect(() => setM(load<Matrix>(KEY, CASE)), []);
  const put = (next: Matrix) => {
    setM(next);
    save(KEY, next);
  };
  const flash = (s: string) => {
    setStatus(s);
    setTimeout(() => setStatus((c) => (c === s ? '' : c)), 2500);
  };

  const res = useMemo(() => check(m), [m]);
  const errors = res.rows.flat().filter((p) => p.level === 'error').length;
  const warns = [...res.rows.flat(), ...res.cols.flat()].filter((p) => p.level === 'warn').length;

  const setCell = (i: number, j: number, v: Val) =>
    put({ ...m, rows: m.rows.map((row, k) => (k === i ? { ...row, cells: row.cells.map((c, l) => (l === j ? v : c)) } : row)) });
  const onCellKey = (i: number, j: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = e.key.toUpperCase();
    const map: Record<string, Val> = { R: 'R', A: 'A', C: 'C', I: 'I', К: 'R', Ф: 'A', С: 'C', Ш: 'I' };
    if (map[k]) {
      e.preventDefault();
      const cur = m.rows[i].cells[j];
      // R на ячейке с A (и наоборот) даёт R/A.
      setCell(i, j, (map[k] === 'R' && cur === 'A') || (map[k] === 'A' && cur === 'R') ? 'R/A' : map[k]);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      setCell(i, j, '');
    } else if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const di = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
      const dj = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      document.getElementById(`raci-${i + di}-${j + dj}`)?.focus();
    }
  };

  const md = () =>
    [
      `| Артефакт / работа | ${m.roles.map(esc).join(' | ')} |`,
      `|---|${m.roles.map(() => '---').join('|')}|`,
      ...m.rows.map((row) => `| ${esc(row.name)} | ${row.cells.map((c) => c || ' ').join(' | ')} |`),
      '',
      'R — делает, A — утверждает и отвечает за результат (одна на строку), C — консультирует, I — информируется.',
    ].join('\n') + '\n';
  const csv = () =>
    '﻿' + [['Артефакт / работа', ...m.roles], ...m.rows.map((row) => [row.name, ...row.cells])].map((line) => line.map(csvCell).join(';')).join('\r\n') + '\r\n';

  return (
    <div className="raci">
      <div className="raci__bar">
        <button type="button" className="sa-btn" onClick={() => put(CASE)}>
          Матрица кейса
        </button>
        <button type="button" className="sa-btn" onClick={() => put(EMPTY)}>
          Новая матрица
        </button>
        <button type="button" className="sa-btn" onClick={() => put({ ...m, roles: [...m.roles, `Роль ${m.roles.length + 1}`], rows: m.rows.map((row) => ({ ...row, cells: [...row.cells, ''] })) })}>
          + Роль
        </button>
        <button type="button" className="sa-btn" onClick={() => put({ ...m, rows: [...m.rows, { name: 'Новый артефакт', cells: m.roles.map(() => '' as Val) }] })}>
          + Строка
        </button>
      </div>
      <p className="raci__hint">
        Щелчок по ячейке — следующее значение (пусто → R → A → R/A → C → I). С клавиатуры: клавиши R, A, C, I (R на A даёт R/A), Delete — очистить,
        стрелки — переход между ячейками.
      </p>

      <p className={`raci__summary${errors ? ' has-errors' : ''}`} aria-live="polite">
        {errors === 0 && warns === 0 ? 'Правила соблюдены: в каждой строке одна A и хотя бы одна R.' : `Ошибок: ${errors} · предупреждений: ${warns}`}
      </p>

      <div className="raci__wrap">
        <table className="raci__table">
          <thead>
            <tr>
              <th scope="col">Артефакт / работа</th>
              {m.roles.map((role, j) => (
                <th key={j} scope="col" className={res.cols[j].length ? 'has-problem' : ''}>
                  <input
                    aria-label={`Роль ${j + 1}`}
                    value={role}
                    onChange={(e) => put({ ...m, roles: m.roles.map((x, l) => (l === j ? e.target.value : x)) })}
                    title={res.cols[j].map((p) => p.text).join('\n')}
                  />
                  <button
                    type="button"
                    className="raci__del"
                    aria-label={`Удалить роль ${role}`}
                    onClick={() => put({ roles: m.roles.filter((_, l) => l !== j), rows: m.rows.map((row) => ({ ...row, cells: row.cells.filter((_, l) => l !== j) })) })}
                  >
                    ×
                  </button>
                </th>
              ))}
              <th scope="col">Проверка</th>
            </tr>
          </thead>
          <tbody>
            {m.rows.map((row, i) => {
              const probs = res.rows[i];
              const lvl = probs.some((p) => p.level === 'error') ? 'error' : probs.some((p) => p.level === 'warn') ? 'warn' : probs.length ? 'info' : 'ok';
              return (
                <tr key={i} className={`is-${lvl}`}>
                  <th scope="row">
                    <input aria-label={`Строка ${i + 1}`} value={row.name} onChange={(e) => put({ ...m, rows: m.rows.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                    <button type="button" className="raci__del" aria-label={`Удалить строку ${row.name}`} onClick={() => put({ ...m, rows: m.rows.filter((_, k) => k !== i) })}>
                      ×
                    </button>
                  </th>
                  {row.cells.map((v, j) => (
                    <td key={j}>
                      <button
                        type="button"
                        id={`raci-${i}-${j}`}
                        className={`raci__cell raci__cell--${v ? v.replace('/', '') : 'none'}`}
                        aria-label={`${row.name}, ${m.roles[j]}: ${v || 'пусто'}`}
                        onClick={() => setCell(i, j, CYCLE[(CYCLE.indexOf(v) + 1) % CYCLE.length])}
                        onKeyDown={onCellKey(i, j)}
                      >
                        {v || '·'}
                      </button>
                    </td>
                  ))}
                  <td className="raci__probs">
                    {probs.length === 0 ? (
                      <span className="raci__ok">✓</span>
                    ) : (
                      <ul>
                        {probs.map((p, k) => (
                          <li key={k} className={`lvl-${p.level}`}>
                            {p.text}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(res.cols.some((c) => c.length) || res.total.length > 0) && (
        <ul className="raci__colprobs">
          {res.cols.flatMap((ps, j) =>
            ps.map((p, k) => (
              <li key={`${j}-${k}`} className={`lvl-${p.level}`}>
                <strong>{m.roles[j]}</strong>: {p.text}
              </li>
            )),
          )}
          {res.total.map((p, k) => (
            <li key={`t-${k}`} className={`lvl-${p.level}`}>
              {p.text}
            </li>
          ))}
        </ul>
      )}

      <div className="raci__bar">
        <button type="button" className="sa-btn sa-btn--primary" onClick={async () => flash((await copyText(md())) ? 'Таблица Markdown скопирована' : 'Не удалось скопировать')}>
          Копировать Markdown
        </button>
        <button type="button" className="sa-btn" onClick={() => downloadText('raci.md', md(), 'text/markdown')}>
          Скачать .md
        </button>
        <button type="button" className="sa-btn" onClick={() => downloadText('raci.csv', csv(), 'text/csv')}>
          Скачать CSV (Excel)
        </button>
        <span className="raci__status" aria-live="polite">
          {status}
        </span>
      </div>
    </div>
  );
}
