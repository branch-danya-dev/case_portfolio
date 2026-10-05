/**
 * Сводка аттестации: статус экзаменов (не начат / попытка есть / пройден), история попыток с динамикой,
 * последний профиль компетенций. compact — короткая версия для главной и маршрута.
 */
import { useEffect, useState } from 'react';
import { COMPETENCIES } from '../../data/assessment/competencies';
import { EXAMS } from '../../data/assessment/exams';
import { ATTEMPTS_KEY, deleteAttempts, examStatus, loadAttempts, type Attempt, type ExamStatus } from '../../lib/assessment/attempts';
import './ExamApp.css';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const fmtDate = (t: number) => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
const href = (exam: string) => `/assessment/${exam}/`;

function statusText(s: ExamStatus, pass: number) {
  switch (s.state) {
    case 'none':
      return 'не начат';
    case 'active':
      return 'попытка не завершена';
    case 'tried':
      return `попытка есть · лучший результат ${pct(s.best)} (порог ${pass}%)`;
    case 'passed':
      return `пройден · лучший результат ${pct(s.best)}`;
  }
}

export default function AssessmentSummary({ compact = false }: { compact?: boolean }) {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const read = () => setAttempts(loadAttempts());
    read();
    const on = (e: Event) => (e as CustomEvent).detail?.key === ATTEMPTS_KEY && read();
    window.addEventListener('sa-storage', on);
    return () => window.removeEventListener('sa-storage', on);
  }, []);

  if (compact) {
    return (
      <ul className="exam-status not-content">
        {EXAMS.map((e) => {
          const s = examStatus(e.id, e.pass);
          return (
            <li key={e.id} data-state={s.state}>
              <a href={href(e.id)}>{e.title}</a> — {statusText(s, e.pass)}
            </li>
          );
        })}
      </ul>
    );
  }

  const finished = attempts.filter((a) => a.finishedAt && a.result);
  const latest = [...finished].sort((a, b) => b.finishedAt! - a.finishedAt!)[0];
  return (
    <div className="exam not-content">
      {EXAMS.map((e) => {
        const list = finished.filter((a) => a.exam === e.id);
        const s = examStatus(e.id, e.pass);
        return (
          <section key={e.id} className="exam-history" aria-labelledby={`sum-${e.id}`}>
            <h2 id={`sum-${e.id}`}>
              <a href={href(e.id)}>{e.title}</a>
            </h2>
            <p className="exam-muted">Статус: {statusText(s, e.pass)}</p>
            {list.length > 0 && (
              <>
                <ol className="exam-attempts">
                  {list.map((a, i) => (
                    <li key={a.id}>
                      <a href={`${href(e.id)}?attempt=${a.id}`}>
                        Попытка {i + 1} — {pct(a.result!.total)}
                        {a.result!.pending ? ' (предварительно)' : ''}
                      </a>
                      <span className="exam-muted"> · {fmtDate(a.finishedAt!)}</span>
                    </li>
                  ))}
                </ol>
                {list.length > 1 && <p className="exam-trend">Динамика: {list.map((a) => pct(a.result!.total)).join(' → ')}</p>}
              </>
            )}
          </section>
        );
      })}

      {latest && (
        <section className="exam-history" aria-labelledby="sum-profile">
          <h2 id="sum-profile">Последний профиль по областям</h2>
          <p className="exam-muted">
            {EXAMS.find((e) => e.id === latest.exam)?.title} — {fmtDate(latest.finishedAt!)}. Области, которых не было в этом экзамене, не показаны.
          </p>
          <ul className="exam-bars">
            {COMPETENCIES.filter((c) => latest.result!.competencies.some((x) => x.id === c.id)).map((c) => {
              const v = latest.result!.competencies.find((x) => x.id === c.id)!.score;
              return (
                <li key={c.id} className={v < 0.6 ? 'is-weak' : ''}>
                  <span>{c.label}</span>
                  <span className="exam-bar-line">
                    <span className="exam-bar-track" role="img" aria-label={`${c.label}: ${pct(v)}`}>
                      <span className="exam-bar-fill" style={{ width: pct(v) }} data-level={v < 0.6 ? 'low' : v < 0.85 ? 'mid' : 'high'} />
                    </span>
                    <span className="exam-bar-value">{pct(v)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {attempts.length > 0 &&
        (confirm ? (
          <p className="exam-bar">
            Удалить все попытки обоих экзаменов, включая незавершённые?
            <button
              type="button"
              className="sa-btn"
              onClick={() => {
                deleteAttempts();
                setConfirm(false);
              }}
            >
              Да, удалить
            </button>
            <button type="button" className="sa-btn" onClick={() => setConfirm(false)}>
              Отмена
            </button>
          </p>
        ) : (
          <p>
            <button type="button" className="sa-btn" onClick={() => setConfirm(true)}>
              Удалить всю историю аттестации
            </button>
          </p>
        ))}
    </div>
  );
}
