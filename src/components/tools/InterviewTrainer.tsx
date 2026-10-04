import { useCallback, useEffect, useMemo, useState } from 'react';
import { load, save } from '../../scripts/storage';
import './InterviewTrainer.css';

export interface TrainerTopic {
  id: string;
  title: string;
  /** Страница, где вопросы темы показаны на сайте. */
  href: string;
}
export interface TrainerQuestion {
  id: string;
  topic: string;
  level: 'junior' | 'middle' | 'senior';
  /** Часто задают на собеседованиях. */
  frequent: boolean;
  question: string;
  answerHtml: string;
}

type Rating = 'unknown' | 'review' | 'known';
type Mode = 'cards' | 'exam';
interface ProgressItem {
  /** Последняя самооценка. */
  s: Rating;
  /** Сколько раз оценивали. */
  n: number;
  /** Когда оценивали последний раз (мс). */
  t: number;
}
interface Settings {
  topics: string[]; // пусто — все темы
  levels: TrainerQuestion['level'][];
  onlyWeak: boolean;
  onlyFrequent: boolean;
  examSize: number;
}
interface Session {
  mode: Mode;
  ids: string[];
  index: number;
  revealed: boolean;
  results: Record<string, Rating>;
  finished: boolean;
}

const PROGRESS_KEY = 'interview-trainer:progress';
const SETTINGS_KEY = 'interview-trainer:settings';
const LEVELS: TrainerQuestion['level'][] = ['junior', 'middle', 'senior'];
const RATING_LABEL: Record<Rating, string> = { unknown: 'Не знаю', review: 'Повторить', known: 'Знаю' };
const DEFAULT_SETTINGS: Settings = { topics: [], levels: [...LEVELS], onlyWeak: false, onlyFrequent: false, examSize: 10 };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Тренажёр собеседования: карточки по банку вопросов с самооценкой и экзамен из N случайных вопросов.
 * Прогресс (последняя оценка по каждому вопросу) хранится только в localStorage этого браузера.
 */
export default function InterviewTrainer({ topics, questions }: { topics: TrainerTopic[]; questions: TrainerQuestion[] }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [progress, setProgress] = useState<Record<string, ProgressItem>>({});
  const [session, setSession] = useState<Session | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    setSettings({ ...DEFAULT_SETTINGS, ...load<Partial<Settings>>(SETTINGS_KEY, {}) });
    setProgress(load<Record<string, ProgressItem>>(PROGRESS_KEY, {}));
  }, []);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      save(SETTINGS_KEY, next);
      return next;
    });
  };

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);
  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics]);

  const filtered = useMemo(
    () =>
      questions.filter(
        (q) =>
          (settings.topics.length === 0 || settings.topics.includes(q.topic)) &&
          settings.levels.includes(q.level) &&
          (!settings.onlyWeak || progress[q.id]?.s !== 'known') &&
          (!settings.onlyFrequent || q.frequent),
      ),
    [questions, settings, progress],
  );

  const start = (mode: Mode, ids?: string[]) => {
    let order: string[];
    if (ids) order = shuffle(ids);
    else if (mode === 'exam') order = shuffle(filtered.map((q) => q.id)).slice(0, settings.examSize);
    else {
      // Сначала «не знаю», потом «повторить», потом новые, в конце «знаю»; внутри группы — случайно.
      const prio = (id: string) => ({ unknown: 0, review: 1, known: 3 })[progress[id]?.s as Rating] ?? 2;
      order = shuffle(filtered.map((q) => q.id)).sort((a, b) => prio(a) - prio(b));
    }
    if (order.length === 0) return;
    setSession({ mode, ids: order, index: 0, revealed: false, results: {}, finished: false });
  };

  const rate = useCallback(
    (r: Rating) => {
      if (!session || session.finished) return;
      const id = session.ids[session.index];
      const next = { ...progress, [id]: { s: r, n: (progress[id]?.n ?? 0) + 1, t: Date.now() } };
      setProgress(next);
      save(PROGRESS_KEY, next);
      const last = session.index >= session.ids.length - 1;
      setSession({
        ...session,
        results: { ...session.results, [id]: r },
        index: last ? session.index : session.index + 1,
        revealed: false,
        finished: last,
      });
    },
    [session, progress],
  );

  const move = useCallback((delta: number) => {
    setSession((s) => {
      if (!s || s.finished) return s;
      const index = Math.min(Math.max(s.index + delta, 0), s.ids.length - 1);
      return index === s.index ? s : { ...s, index, revealed: false };
    });
  }, []);

  const reveal = useCallback(() => setSession((s) => (s && !s.finished ? { ...s, revealed: !s.revealed } : s)), []);

  // Клавиатура: пробел / Enter — ответ, 1 / 2 / 3 — оценка, стрелки — навигация.
  useEffect(() => {
    if (!session || session.finished) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('input, textarea, select, a, [contenteditable]')) return;
      if (t?.closest('button') && (e.key === ' ' || e.key === 'Enter')) return; // кнопка сама обработает
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        reveal();
      } else if (session.revealed && ['1', '2', '3'].includes(e.key)) {
        rate((['unknown', 'review', 'known'] as Rating[])[Number(e.key) - 1]);
      } else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session, reveal, rate, move]);

  const resetProgress = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setProgress({});
    save(PROGRESS_KEY, {});
    setConfirmReset(false);
  };

  // ---------- Сессия ----------
  if (session && !session.finished) {
    const q = byId.get(session.ids[session.index])!;
    const topic = topicById.get(q.topic);
    const prev = progress[q.id];
    return (
      <div className="trainer not-content">
        <div className="trainer__bar">
          <span>
            {session.mode === 'exam' ? 'Экзамен' : 'Карточки'} · вопрос {session.index + 1} из {session.ids.length}
          </span>
          <button type="button" className="sa-btn" onClick={() => setSession({ ...session, finished: true })}>
            Закончить
          </button>
        </div>
        <div className="trainer__track" aria-hidden="true">
          <div style={{ width: `${(Object.keys(session.results).length / session.ids.length) * 100}%` }} />
        </div>

        <article className="trainer__card" aria-live="polite">
          <header className="trainer__meta">
            <a href={`${topic?.href ?? '#'}#q-${q.id}`}>{topic?.title}</a>
            <span className="level-badge" data-level={q.level}>
              {q.level}
            </span>
            {q.frequent && <span className="frequent-badge">частый</span>}
            {prev && <span className={`trainer__prev trainer__prev--${prev.s}`}>в прошлый раз: {RATING_LABEL[prev.s].toLowerCase()}</span>}
          </header>
          <p className="trainer__question">{q.question}</p>

          {session.revealed ? (
            <>
              <div className="trainer__answer" dangerouslySetInnerHTML={{ __html: q.answerHtml }} />
              <div className="trainer__rate" role="group" aria-label="Насколько хорошо вы ответили">
                <button type="button" className="sa-btn trainer__r--unknown" onClick={() => rate('unknown')}>
                  Не знаю <kbd>1</kbd>
                </button>
                <button type="button" className="sa-btn trainer__r--review" onClick={() => rate('review')}>
                  Повторить <kbd>2</kbd>
                </button>
                <button type="button" className="sa-btn trainer__r--known" onClick={() => rate('known')}>
                  Знаю <kbd>3</kbd>
                </button>
              </div>
            </>
          ) : (
            <div className="trainer__reveal">
              <p>Ответьте вслух, потом откройте ответ и сравните.</p>
              <button type="button" className="sa-btn sa-btn--primary" onClick={reveal}>
                Показать ответ <kbd>Пробел</kbd>
              </button>
            </div>
          )}
        </article>

        <div className="trainer__nav">
          <button type="button" className="sa-btn" onClick={() => move(-1)} disabled={session.index === 0}>
            ← Назад
          </button>
          <span className="trainer__hint">Клавиши: Пробел — ответ, 1 / 2 / 3 — оценка, ← → — листать</span>
          <button type="button" className="sa-btn" onClick={() => move(1)} disabled={session.index >= session.ids.length - 1}>
            Пропустить →
          </button>
        </div>
      </div>
    );
  }

  // ---------- Итоги ----------
  if (session?.finished) {
    const rated = Object.entries(session.results);
    const count = (r: Rating) => rated.filter(([, v]) => v === r).length;
    const weak = rated.filter(([, v]) => v !== 'known').map(([id]) => id);
    return (
      <div className="trainer not-content">
        <h2 className="trainer__title">Итоги</h2>
        <p>
          Оценено {rated.length} из {session.ids.length}.{' '}
          {rated.length > 0 && <>Знаю — {Math.round((count('known') / rated.length) * 100)} %.</>}
        </p>
        <ul className="trainer__summary">
          {(['known', 'review', 'unknown'] as Rating[]).map((r) => (
            <li key={r} className={`trainer__prev--${r}`}>
              {RATING_LABEL[r]}: <strong>{count(r)}</strong>
            </li>
          ))}
        </ul>
        {weak.length > 0 && (
          <>
            <h3>Что повторить</h3>
            <ul>
              {weak.map((id) => {
                const q = byId.get(id)!;
                const t = topicById.get(q.topic);
                return (
                  <li key={id}>
                    <a href={`${t?.href ?? '#'}#q-${id}`}>{q.question}</a> <small>· {t?.title}</small>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div className="trainer__actions">
          {weak.length > 0 && (
            <button type="button" className="sa-btn sa-btn--primary" onClick={() => start('cards', weak)}>
              Повторить слабые ({weak.length})
            </button>
          )}
          <button type="button" className="sa-btn" onClick={() => setSession(null)}>
            К настройкам
          </button>
        </div>
      </div>
    );
  }

  // ---------- Настройки и прогресс ----------
  const toggleTopic = (id: string) =>
    updateSettings({ topics: settings.topics.includes(id) ? settings.topics.filter((t) => t !== id) : [...settings.topics, id] });
  const toggleLevel = (l: TrainerQuestion['level']) =>
    updateSettings({
      levels: settings.levels.includes(l) ? settings.levels.filter((x) => x !== l) : LEVELS.filter((x) => x === l || settings.levels.includes(x)),
    });
  const totalKnown = questions.filter((q) => progress[q.id]?.s === 'known').length;

  return (
    <div className="trainer not-content">
      <fieldset className="trainer__group">
        <legend>Темы {settings.topics.length === 0 ? '(все)' : `(${settings.topics.length})`}</legend>
        <div className="trainer__chips">
          {topics.map((t) => (
            <label key={t.id} className="trainer__chip">
              <input type="checkbox" checked={settings.topics.includes(t.id)} onChange={() => toggleTopic(t.id)} />
              {t.title}
            </label>
          ))}
        </div>
        {settings.topics.length > 0 && (
          <button type="button" className="trainer__link" onClick={() => updateSettings({ topics: [] })}>
            Сбросить выбор — все темы
          </button>
        )}
      </fieldset>

      <fieldset className="trainer__group trainer__row">
        <legend>Уровень и отбор</legend>
        {LEVELS.map((l) => (
          <label key={l}>
            <input type="checkbox" checked={settings.levels.includes(l)} onChange={() => toggleLevel(l)} /> {l}
          </label>
        ))}
        <label>
          <input type="checkbox" checked={settings.onlyWeak} onChange={(e) => updateSettings({ onlyWeak: e.target.checked })} /> только
          не освоенные
        </label>
        <label>
          <input type="checkbox" checked={settings.onlyFrequent} onChange={(e) => updateSettings({ onlyFrequent: e.target.checked })} />{' '}
          только частые ({questions.filter((q) => q.frequent).length})
        </label>
        <label>
          Вопросов в экзамене:{' '}
          <select value={settings.examSize} onChange={(e) => updateSettings({ examSize: Number(e.target.value) })}>
            {[5, 10, 20, 30].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <div className="trainer__actions">
        <button type="button" className="sa-btn sa-btn--primary" onClick={() => start('cards')} disabled={filtered.length === 0}>
          Карточки ({filtered.length})
        </button>
        <button type="button" className="sa-btn" onClick={() => start('exam')} disabled={filtered.length === 0}>
          Экзамен: {Math.min(settings.examSize, filtered.length)} случайных
        </button>
        {filtered.length === 0 && <span className="trainer__hint">Под выбранные условия вопросов нет.</span>}
      </div>

      <h2 className="trainer__title">
        Прогресс: знаю {totalKnown} из {questions.length}
      </h2>
      <table className="trainer__stats">
        <thead>
          <tr>
            <th>Тема</th>
            <th>Знаю / повторить / не знаю</th>
            <th>Всего</th>
          </tr>
        </thead>
        <tbody>
          {topics.map((t) => {
            const qs = questions.filter((q) => q.topic === t.id);
            const c = (r: Rating) => qs.filter((q) => progress[q.id]?.s === r).length;
            const pct = (n: number) => `${(n / qs.length) * 100}%`;
            return (
              <tr key={t.id}>
                <td>
                  <a href={t.href}>{t.title}</a>
                </td>
                <td>
                  <div className="trainer__stack" title={`Знаю ${c('known')}, повторить ${c('review')}, не знаю ${c('unknown')}`}>
                    <span className="trainer__prev--known" style={{ width: pct(c('known')) }} />
                    <span className="trainer__prev--review" style={{ width: pct(c('review')) }} />
                    <span className="trainer__prev--unknown" style={{ width: pct(c('unknown')) }} />
                  </div>
                  <small>
                    {c('known')} / {c('review')} / {c('unknown')}
                  </small>
                </td>
                <td>{qs.length}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="trainer__actions">
        <button type="button" className="sa-btn" onClick={resetProgress} onBlur={() => setConfirmReset(false)}>
          {confirmReset ? 'Точно сбросить? Нажмите ещё раз' : 'Сбросить прогресс'}
        </button>
      </div>
    </div>
  );
}
