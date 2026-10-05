/**
 * Экзамен: начать попытку → задания → обзор незаполненных → завершить → результат и разбор.
 * До завершения эталоны, разборы и ссылки на разборы не показываются. Попытка сохраняется после
 * каждого ответа и восстанавливается при повторном открытии страницы.
 */
import { useEffect, useMemo, useState } from 'react';
import { COMPETENCIES } from '../../data/assessment/competencies';
import { ALL_ITEMS, CASES, caseById, examById, itemById } from '../../data/assessment';
import type { ExamId, Item } from '../../data/assessment/types';
import type { Exchange } from '../../lib/api-lab/mock';
import { activeAttempt, compactLog, deleteAttempts, finishedAttempts, loadAttempts, saveAttempt, type Attempt } from '../../lib/assessment/attempts';
import { newSeed } from '../../lib/assessment/rng';
import { aggregate, band, isAnswered, type Answer } from '../../lib/assessment/score';
import { buildPlan } from '../../lib/assessment/select';
import CaseMaterials from './CaseMaterials';
import { evaluate } from './engine';
import ItemView from './ItemView';
import Results from './Results';
import './ExamApp.css';

type View = 'intro' | 'run' | 'overview' | 'result';
const pct = (x: number) => `${Math.round(x * 100)}%`;
const compLabel = (id: string) => COMPETENCIES.find((c) => c.id === id)?.label ?? id;
const fmtDate = (t: number) => new Date(t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Отвечено ли задание: для практики — есть запросы к серверу или текст отличается от стартового. */
export function answered(item: Item, at: Attempt): boolean {
  const a = at.answers[item.id];
  if (item.type === 'http') return (at.logs[item.id]?.length ?? 0) > 0;
  if (item.type === 'json-schema' || item.type === 'openapi') return a?.t === 'text' && a.v.trim() !== '' && a.v !== item.start;
  return isAnswered(item, a);
}

export default function ExamApp({ examId, titles }: { examId: ExamId; titles: Record<string, string> }) {
  const exam = examById(examId);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [view, setView] = useState<View>('intro');
  const [history, setHistory] = useState<Attempt[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const refreshHistory = () => setHistory(finishedAttempts(examId).reverse());

  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get('attempt');
    const old = wanted ? loadAttempts().find((a) => a.id === wanted && a.exam === examId && a.finishedAt) : undefined;
    const active = activeAttempt(examId);
    if (old) {
      setAttempt(old);
      setView('result');
    } else if (active) {
      setAttempt(active);
      setView('run');
    }
    refreshHistory();
  }, [examId]);

  const update = (next: Attempt) => {
    setAttempt(next);
    saveAttempt(next);
  };

  const start = () => {
    const seed = newSeed();
    const plan = buildPlan(exam, ALL_ITEMS, CASES, seed);
    const first = plan.sections[0].items[0];
    const a: Attempt = { id: `${examId}-${Date.now().toString(36)}`, exam: examId, plan, startedAt: Date.now(), current: first, answers: {}, logs: {}, auto: {}, selfMarks: {} };
    update(a);
    setView('run');
    setConfirmFinish(false);
    scrollTop();
  };

  const finish = async () => {
    if (!attempt) return;
    setBusy(true);
    const auto: Attempt['auto'] = {};
    for (const id of attempt.plan.sections.flatMap((s) => s.items)) {
      const item = itemById(id);
      const res = await evaluate(item, attempt.answers[id], attempt.logs[id]);
      if (res) auto[id] = res;
    }
    const done = withResult({ ...attempt, auto, finishedAt: Date.now() });
    update(done);
    setBusy(false);
    setView('result');
    refreshHistory();
    scrollTop();
  };

  const withResult = (a: Attempt): Attempt => {
    const r = aggregate(exam, a.plan, itemById, a.answers, a.auto, a.selfMarks);
    return {
      ...a,
      result: {
        total: r.total,
        pending: r.pending,
        sections: r.sections.map((s) => ({ id: s.id, score: s.score })),
        competencies: r.competencies.map((c) => ({ id: c.id, score: c.score })),
      },
    };
  };

  if (view === 'result' && attempt?.finishedAt) {
    return (
      <div className="exam not-content">
        <ResultHeader
          exam={exam.title}
          attempt={attempt}
          onNew={start}
          onBack={() => {
            setAttempt(null);
            setView('intro');
            refreshHistory();
            if (location.search) window.history.replaceState(null, '', location.pathname);
          }}
        />
        <Results exam={exam} attempt={attempt} titles={titles} onSelfMark={(id, marks) => update(withResult({ ...attempt, selfMarks: { ...attempt.selfMarks, [id]: marks } }))} />
      </div>
    );
  }

  if ((view === 'run' || view === 'overview') && attempt && !attempt.finishedAt) {
    const ids = attempt.plan.sections.flatMap((s) => s.items);
    const total = ids.length;
    const done = ids.filter((id) => answered(itemById(id), attempt)).length;
    const pos = Math.max(0, ids.indexOf(attempt.current));
    const item = itemById(ids[pos]);
    const sectionOf = (id: string) => exam.sections.find((s) => attempt.plan.sections.find((p) => p.id === s.id)?.items.includes(id))!;
    const go = (id: string) => {
      update({ ...attempt, current: id });
      setView('run');
      setConfirmFinish(false);
      scrollTop();
    };
    const caseData = attempt.plan.caseId ? caseById(attempt.plan.caseId) : undefined;

    return (
      <div className="exam exam--run not-content">
        <header className="exam-head">
          <div>
            <p className="exam-head__title">{exam.title}</p>
            <p className="exam-muted">
              Отвечено {done} из {total} · начато {fmtDate(attempt.startedAt)}
            </p>
          </div>
          <div className="exam-progress" role="progressbar" aria-label="Отвечено заданий" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <span style={{ width: `${(done / total) * 100}%` }} />
          </div>
        </header>

        <div className="exam-layout">
          <nav className="exam-nav" aria-label="Задания">
            {attempt.plan.sections.map((s) => (
              <div key={s.id}>
                <p className="exam-nav__section">{exam.sections.find((x) => x.id === s.id)?.title}</p>
                <ol>
                  {s.items.map((id) => {
                    const n = ids.indexOf(id) + 1;
                    const ok = answered(itemById(id), attempt);
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          className={`exam-nav__btn${id === attempt.current && view === 'run' ? ' is-current' : ''}${ok ? ' is-done' : ''}`}
                          aria-current={id === attempt.current && view === 'run' ? 'step' : undefined}
                          aria-label={`Задание ${n}${ok ? ', есть ответ' : ', нет ответа'}`}
                          onClick={() => go(id)}
                        >
                          {n}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </div>
            ))}
            <button type="button" className={`sa-btn exam-nav__finish${view === 'overview' ? ' is-current' : ''}`} onClick={() => setView('overview')}>
              Обзор и завершение
            </button>
          </nav>

          <main className="exam-main">
            {view === 'overview' ? (
              <Overview
                attempt={attempt}
                ids={ids}
                busy={busy}
                confirm={confirmFinish}
                setConfirm={setConfirmFinish}
                onGo={go}
                onFinish={finish}
                sectionTitle={(id) => exam.sections.find((s) => s.id === id)?.title ?? id}
              />
            ) : (
              <>
                <p className="exam-item__meta">
                  Задание {pos + 1} из {total} · {sectionOf(item.id).title} · {compLabel(item.competency)} · вес {item.weight}
                </p>
                {item.kind === 'case' && caseData && <CaseMaterials data={caseData} highlight={item.materials} />}
                <ItemView
                  key={item.id}
                  item={item}
                  seed={attempt.plan.seed}
                  answer={attempt.answers[item.id]}
                  log={attempt.logs[item.id]}
                  onAnswer={(a: Answer) => update({ ...attempt, answers: { ...attempt.answers, [item.id]: a } })}
                  onLog={(log: Exchange[]) => update({ ...attempt, logs: { ...attempt.logs, [item.id]: compactLog(log) } })}
                />
                <div className="exam-pager">
                  <button type="button" className="sa-btn" disabled={pos === 0} onClick={() => go(ids[pos - 1])}>
                    ← Предыдущее
                  </button>
                  {pos < total - 1 ? (
                    <button type="button" className="sa-btn sa-btn--primary" onClick={() => go(ids[pos + 1])}>
                      Следующее →
                    </button>
                  ) : (
                    <button type="button" className="sa-btn sa-btn--primary" onClick={() => setView('overview')}>
                      К обзору и завершению →
                    </button>
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    );
  }

  // ---------- Вступление и история ----------
  const counts = exam.sections.map((s) => ({
    ...s,
    n: (s.fixed?.length ?? 0) + (s.pick ?? []).reduce((t, r) => t + r.count, 0) + (s.kind === 'case' ? Math.max(...CASES.filter((c) => exam.cases?.includes(c.id)).map((c) => c.items.length), 0) : 0),
  }));
  const best = history.filter((h) => h.result).reduce((m, h) => Math.max(m, h.result!.total), -1);
  return (
    <div className="exam not-content">
      <section className="exam-intro">
        <p>{exam.description}</p>
        <table className="exam-plan">
          <thead>
            <tr>
              <th>Раздел</th>
              <th>Заданий</th>
              <th>Вес в итоге</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((s) => (
              <tr key={s.id}>
                <td>{s.title}</td>
                <td>{s.n}</td>
                <td>{s.share}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="exam-rules">
          <li>Задания каждый раз подбираются заново: обязательный минимум по каждой области и случайный выбор внутри неё.</li>
          <li>Правильные ответы, разборы и ссылки на темы показываются только после завершения попытки.</li>
          <li>Практика выполняется на настоящих инструментах: SQL на учебной БД, запросы к учебному серверу, проверка схем и контрактов.</li>
          <li>Таймера нет. Попытка сохраняется после каждого ответа: можно закрыть страницу и продолжить.</li>
          <li>Порог «пройден» — {exam.pass}%. Результат — оценка освоения материалов справочника, а не сертификация и не грейд.</li>
        </ul>
        <button type="button" className="sa-btn sa-btn--primary" onClick={start}>
          Начать попытку
        </button>
      </section>

      <section className="exam-history" aria-labelledby="exam-history-title">
        <h2 id="exam-history-title">Мои попытки</h2>
        {history.length === 0 ? (
          <p className="exam-muted">Попыток пока нет.</p>
        ) : (
          <>
            <ol className="exam-attempts" reversed>
              {history.map((h, i) => (
                <li key={h.id}>
                  <a href={`?attempt=${h.id}`}>
                    Попытка {history.length - i} — {h.result ? pct(h.result.total) : '—'}
                    {h.result?.pending ? ' (предварительно)' : ''}
                  </a>
                  <span className="exam-muted">
                    {' '}
                    · {fmtDate(h.finishedAt!)}
                    {h.result && h.result.total === best ? ' · лучшая' : ''}
                    {h.result && h.result.total * 100 >= exam.pass ? ' · пройден' : ''}
                  </span>
                </li>
              ))}
            </ol>
            {history.length > 1 && <Trend values={[...history].reverse().map((h) => h.result?.total ?? 0)} />}
            {confirmDelete ? (
              <p className="exam-bar">
                Удалить все попытки экзамена «{exam.title}»?
                <button
                  type="button"
                  className="sa-btn"
                  onClick={() => {
                    deleteAttempts(examId);
                    setConfirmDelete(false);
                    refreshHistory();
                  }}
                >
                  Да, удалить
                </button>
                <button type="button" className="sa-btn" onClick={() => setConfirmDelete(false)}>
                  Отмена
                </button>
              </p>
            ) : (
              <button type="button" className="sa-btn" onClick={() => setConfirmDelete(true)}>
                Удалить историю
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function Trend({ values }: { values: number[] }) {
  return (
    <p className="exam-trend" aria-label={`Динамика: ${values.map(pct).join(' → ')}`}>
      Динамика: {values.map(pct).join(' → ')}
    </p>
  );
}

function ResultHeader({ exam, attempt, onNew, onBack }: { exam: string; attempt: Attempt; onNew: () => void; onBack: () => void }) {
  const b = attempt.result ? band(attempt.result.total) : null;
  return (
    <header className="exam-head">
      <div>
        <p className="exam-head__title">
          {exam} · результат{b ? `: ${b.label.toLowerCase()}` : ''}
        </p>
        <p className="exam-muted">Завершено {fmtDate(attempt.finishedAt!)}</p>
      </div>
      <div className="exam-bar">
        <button type="button" className="sa-btn" onClick={onBack}>
          К истории попыток
        </button>
        <button type="button" className="sa-btn sa-btn--primary" onClick={onNew}>
          Новая попытка
        </button>
      </div>
    </header>
  );
}

function Overview({
  attempt,
  ids,
  busy,
  confirm,
  setConfirm,
  onGo,
  onFinish,
  sectionTitle,
}: {
  attempt: Attempt;
  ids: string[];
  busy: boolean;
  confirm: boolean;
  setConfirm: (v: boolean) => void;
  onGo: (id: string) => void;
  onFinish: () => void;
  sectionTitle: (id: string) => string;
}) {
  const missing = ids.filter((id) => !answered(itemById(id), attempt));
  return (
    <section className="exam-overview" aria-labelledby="overview-title">
      <h2 id="overview-title">Обзор перед завершением</h2>
      <ul>
        {attempt.plan.sections.map((s) => {
          const n = s.items.filter((id) => answered(itemById(id), attempt)).length;
          return (
            <li key={s.id}>
              {sectionTitle(s.id)}: отвечено {n} из {s.items.length}
            </li>
          );
        })}
      </ul>
      {missing.length > 0 ? (
        <>
          <p>Без ответа:</p>
          <ul className="exam-missing">
            {missing.map((id) => (
              <li key={id}>
                <button type="button" className="exam-link" onClick={() => onGo(id)}>
                  Задание {ids.indexOf(id) + 1} — {compLabel(itemById(id).competency)}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>На все задания есть ответ.</p>
      )}
      <p className="exam-note">После завершения ответы изменить нельзя. Откроются правильные ответы, разборы и результат по областям.</p>
      {confirm ? (
        <p className="exam-bar">
          <strong>Завершить попытку{missing.length ? ` (без ответа: ${missing.length})` : ''}?</strong>
          <button type="button" className="sa-btn sa-btn--primary" onClick={onFinish} disabled={busy}>
            {busy ? 'Проверяю…' : 'Да, завершить'}
          </button>
          <button type="button" className="sa-btn" onClick={() => setConfirm(false)} disabled={busy}>
            Вернуться к заданиям
          </button>
        </p>
      ) : (
        <button type="button" className="sa-btn sa-btn--primary" onClick={() => setConfirm(true)}>
          Завершить попытку
        </button>
      )}
    </section>
  );
}

function scrollTop() {
  requestAnimationFrame(() => document.querySelector('.exam')?.scrollIntoView({ block: 'start' }));
}
