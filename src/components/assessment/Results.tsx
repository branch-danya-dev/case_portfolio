/**
 * Результат попытки: итог и интерпретация, разделы, профиль компетенций, слабые области, темы для повторения,
 * невыполненная практика и разбор каждого задания. Открытые ответы оцениваются самопроверкой по рубрике.
 */
import { useMemo } from 'react';
import { COMPETENCIES } from '../../data/assessment/competencies';
import { itemById } from '../../data/assessment';
import type { Exam, Item } from '../../data/assessment/types';
import type { Attempt } from '../../lib/assessment/attempts';
import { aggregate, band, weakCompetencies, type Answer } from '../../lib/assessment/score';
import { md } from './engine';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const compLabel = (id: string) => COMPETENCIES.find((c) => c.id === id)?.label ?? id;

interface Props {
  exam: Exam;
  attempt: Attempt;
  titles: Record<string, string>;
  onSelfMark: (itemId: string, marks: boolean[]) => void;
}

export default function Results({ exam, attempt, titles, onSelfMark }: Props) {
  const r = useMemo(() => aggregate(exam, attempt.plan, itemById, attempt.answers, attempt.auto, attempt.selfMarks), [exam, attempt]);
  const b = band(r.total);
  const weak = weakCompetencies(r);
  const order = attempt.plan.sections.flatMap((s) => s.items);
  const itemScore = new Map(r.items.map((i) => [i.id, i]));
  const unfinished = order.filter((id) => {
    const it = itemById(id);
    return it.kind !== 'theory' && (itemScore.get(id)?.score ?? 0) < 1 && it.type !== 'text';
  });
  const pendingText = order.filter((id) => itemScore.get(id)?.score === null);
  const repeat = useMemo(() => {
    // Темы для повторения: страницы заданий, где балл ниже 1, + страницы слабых компетенций.
    const pages = new Map<string, number>();
    for (const id of order) {
      const s = itemScore.get(id)?.score;
      if (s !== null && s !== undefined && s < 1) for (const ref of itemById(id).refs) pages.set(ref, (pages.get(ref) ?? 0) + 1);
    }
    for (const w of weak) for (const ref of COMPETENCIES.find((c) => c.id === w.id)?.refs ?? []) pages.set(ref, (pages.get(ref) ?? 0) + 1);
    return [...pages].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  }, [attempt]);

  return (
    <div className="exam-result">
      <section className="exam-score" aria-label="Итог">
        <p className="exam-score__total">
          {pct(r.total)}
          {r.pending && <span className="exam-score__pending"> предварительно</span>}
        </p>
        <p className="exam-score__band">
          <strong>{b.label}.</strong> {b.text}
        </p>
        <p className="exam-score__pass">
          Порог экзамена — {exam.pass}%: {r.total * 100 >= exam.pass ? 'пройден' : 'не пройден'}.
        </p>
        {r.pending && (
          <p className="exam-note">
            Открытых ответов без самопроверки: {pendingText.length}. Пока они считаются как 0 — оцените их ниже по критериям, и итог пересчитается.
          </p>
        )}
        <p className="exam-note">
          Это оценка освоения материалов справочника, а не профессиональная сертификация и не грейд на рынке.
        </p>
      </section>

      <section aria-labelledby="res-sections">
        <h2 id="res-sections">Разделы</h2>
        <ul className="exam-bars">
          {r.sections.map((s) => (
            <li key={s.id}>
              <span>
                {s.title} <span className="exam-muted">· вес {s.share}%</span>
              </span>
              <Bar value={s.score} label={s.title} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="res-comp">
        <h2 id="res-comp">Профиль компетенций</h2>
        <ul className="exam-bars">
          {[...r.competencies]
            .sort((a, b) => COMPETENCIES.findIndex((c) => c.id === a.id) - COMPETENCIES.findIndex((c) => c.id === b.id))
            .map((c) => (
              <li key={c.id} className={c.score < 0.6 ? 'is-weak' : ''}>
                <span>
                  {compLabel(c.id)} <span className="exam-muted">· заданий: {c.items}</span>
                </span>
                <Bar value={c.score} label={compLabel(c.id)} />
              </li>
            ))}
        </ul>
        {weak.length > 0 ? (
          <p>
            <strong>Слабые области</strong> (ниже 60%): {weak.map((w) => compLabel(w.id)).join(', ')}.
          </p>
        ) : (
          <p>Слабых областей (ниже 60%) нет.</p>
        )}
      </section>

      {repeat.length > 0 && (
        <section aria-labelledby="res-repeat">
          <h2 id="res-repeat">Что повторить</h2>
          <ul className="exam-links">
            {repeat.slice(0, 12).map((p) => (
              <li key={p}>
                <a href={`/${p}/`}>{titles[p] ?? p}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unfinished.length > 0 && (
        <section aria-labelledby="res-unfinished">
          <h2 id="res-unfinished">Практика выполнена не полностью</h2>
          <ul>
            {unfinished.map((id) => (
              <li key={id}>
                <a href={`#review-${id}`}>
                  {order.indexOf(id) + 1}. {firstLine(itemById(id).prompt)}
                </a>{' '}
                — {pct(itemScore.get(id)?.score ?? 0)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="res-review">
        <h2 id="res-review">Разбор заданий</h2>
        <ol className="exam-review">
          {order.map((id, n) => (
            <Review key={id} n={n + 1} item={itemById(id)} attempt={attempt} score={itemScore.get(id)?.score ?? 0} titles={titles} onSelfMark={onSelfMark} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function Bar({ value, label }: { value: number; label: string }) {
  return (
    <span className="exam-bar-line">
      <span className="exam-bar-track" role="img" aria-label={`${label}: ${pct(value)}`}>
        <span className="exam-bar-fill" style={{ width: pct(value) }} data-level={value < 0.6 ? 'low' : value < 0.85 ? 'mid' : 'high'} />
      </span>
      <span className="exam-bar-value">{pct(value)}</span>
    </span>
  );
}

const firstLine = (s: string) => {
  const line = s.replace(/[*`#>]/g, '').split('\n').find((l) => l.trim()) ?? '';
  return line.length > 90 ? line.slice(0, 90) + '…' : line;
};

function Review({ n, item, attempt, score, titles, onSelfMark }: { n: number; item: Item; attempt: Attempt; score: number | null; titles: Record<string, string>; onSelfMark: Props['onSelfMark'] }) {
  const a = attempt.answers[item.id];
  const auto = attempt.auto[item.id];
  const marks = attempt.selfMarks[item.id] ?? (item.type === 'text' ? item.rubric.map(() => false) : []);
  return (
    <li id={`review-${item.id}`} className="exam-review__item">
      <details open={score !== null && score < 1}>
        <summary>
          <span>
            {n}. {firstLine(item.prompt)}
          </span>
          <span className="exam-review__score" data-level={score === null ? 'pending' : score >= 1 ? 'high' : score > 0 ? 'mid' : 'low'}>
            {score === null ? 'оцените' : pct(score)}
          </span>
        </summary>
        <p className="exam-muted">
          {compLabel(item.competency)} · вес {item.weight}
        </p>
        <div className="exam-item__prompt" dangerouslySetInnerHTML={{ __html: md(item.prompt) }} />
        <YourAnswer item={item} a={a} />
        <Correct item={item} />
        {auto && (
          <ul className="exam-checks" aria-label="Автоматическая проверка">
            {auto.notes.map((x, i) => (
              <li key={i} data-ok={x.ok}>
                {x.ok ? '✓' : '✗'} {x.label}
              </li>
            ))}
          </ul>
        )}
        {item.type === 'text' && (
          <fieldset className="exam-rubric">
            <legend>Самопроверка: отметьте, что есть в вашем ответе</legend>
            {item.rubric.map((c, i) => (
              <label key={i}>
                <input
                  type="checkbox"
                  checked={!!marks[i]}
                  disabled={!(a?.t === 'text' && a.v.trim())}
                  onChange={(e) => {
                    const next = item.rubric.map((_, j) => (j === i ? e.target.checked : !!marks[j]));
                    onSelfMark(item.id, next);
                  }}
                />{' '}
                {c}
              </label>
            ))}
            {!(a?.t === 'text' && a.v.trim()) && <p className="exam-muted">Ответа нет — задание засчитано как 0.</p>}
          </fieldset>
        )}
        <div className="exam-explain">
          <strong>Разбор.</strong>
          <div dangerouslySetInnerHTML={{ __html: md(item.explanation) }} />
        </div>
        <p className="exam-muted">
          Повторить:{' '}
          {item.refs.map((r, i) => (
            <span key={r}>
              {i > 0 && ', '}
              <a href={`/${r}/`}>{titles[r] ?? r}</a>
            </span>
          ))}
        </p>
      </details>
    </li>
  );
}

function YourAnswer({ item, a }: { item: Item; a?: Answer }) {
  let text = '';
  if (!a) text = 'нет ответа';
  else if (item.type === 'single' && a.t === 'single') text = item.options[a.v];
  else if (item.type === 'multiple' && a.t === 'multiple') text = a.v.map((i) => item.options[i]).join('; ');
  else if (item.type === 'order' && a.t === 'order') text = a.v.map((i, k) => `${k + 1}) ${item.steps[i]}`).join('\n');
  else if (item.type === 'match' && a.t === 'match') text = item.pairs.map((p, i) => `${p.left} → ${a.v[i] === null ? '—' : item.pairs[a.v[i]!].right}`).join('\n');
  else if (a.t === 'text') text = a.v || 'нет ответа';
  if (item.type === 'http') text = '';
  if (!text) return null;
  return (
    <div className="exam-answer">
      <strong>Ваш ответ</strong>
      <div className="exam-raw">{text}</div>
    </div>
  );
}

function Correct({ item }: { item: Item }) {
  let text = '';
  if (item.type === 'single') text = item.options[item.answer];
  if (item.type === 'multiple') text = item.answer.map((i) => item.options[i]).join('; ');
  if (item.type === 'order') text = item.steps.map((s, k) => `${k + 1}) ${s}`).join('\n');
  if (item.type === 'match') text = item.pairs.map((p) => `${p.left} → ${p.right}`).join('\n');
  if (item.type === 'sql') text = item.solution;
  if (item.type === 'http') text = item.reference.join('\n\n');
  if (item.type === 'json-schema' || item.type === 'openapi' || item.type === 'text') text = item.reference;
  return (
    <div className="exam-answer exam-answer--correct">
      <strong>{item.type === 'text' ? 'Эталон' : item.kind === 'theory' ? 'Правильный ответ' : 'Эталонное решение'}</strong>
      <div className="exam-raw">{text}</div>
    </div>
  );
}
