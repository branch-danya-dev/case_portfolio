/**
 * Подсчёт баллов. Балл задания — число от 0 до 1; раздел — взвешенное среднее по весам заданий;
 * итог — среднее разделов с долями из схемы экзамена; компетенция — взвешенное среднее её заданий.
 * Все суммы коммутативны: результат не зависит от порядка заданий.
 */
import type { CompetencyId, Exam, Item } from '../../data/assessment/types';
import type { AttemptPlan } from './select';

/** Ответ пользователя. Для choice-заданий индексы — исходные (до перемешивания на экране). */
export type Answer =
  | { t: 'single'; v: number }
  | { t: 'multiple'; v: number[] }
  | { t: 'order'; v: number[] }
  | { t: 'match'; v: (number | null)[] }
  | { t: 'text'; v: string };

/** Результат автоматической проверки практического задания (вычисляется при завершении). */
export interface AutoResult {
  score: number;
  notes: { label: string; ok: boolean }[];
}

export interface ItemScore {
  id: string;
  /** null — открытый ответ ещё не оценён самопроверкой. */
  score: number | null;
  weight: number;
  competency: CompetencyId;
  answered: boolean;
}

export interface SectionResult {
  id: string;
  title: string;
  share: number;
  score: number;
}
export interface CompetencyResult {
  id: CompetencyId;
  score: number;
  weight: number;
  items: number;
}
export interface ExamResult {
  total: number;
  /** Есть открытые ответы без самопроверки: итог предварительный (они считаются как 0). */
  pending: boolean;
  sections: SectionResult[];
  competencies: CompetencyResult[];
  items: ItemScore[];
}

export function isAnswered(item: Item, a: Answer | undefined): boolean {
  if (!a) return false;
  switch (a.t) {
    case 'single':
      return a.v >= 0;
    case 'multiple':
      return a.v.length > 0;
    case 'order':
      return a.v.length === (item.type === 'order' ? item.steps.length : 0);
    case 'match':
      return a.v.some((x) => x !== null);
    case 'text':
      return a.v.trim().length > 0;
  }
}

/** Доля верных соседних пар: частично правильный порядок даёт частичный балл. */
export function orderScore(user: number[], n: number): number {
  if (n < 2) return user[0] === 0 ? 1 : 0;
  let ok = 0;
  for (let i = 0; i < user.length - 1; i++) if (user[i + 1] === user[i] + 1) ok++;
  return ok / (n - 1);
}

export function scoreItem(item: Item, a: Answer | undefined, auto?: AutoResult, selfMarks?: boolean[]): number | null {
  switch (item.type) {
    case 'single':
      return a?.t === 'single' && a.v === item.answer ? 1 : 0;
    case 'multiple': {
      if (a?.t !== 'multiple') return 0;
      const right = new Set(item.answer);
      const hit = a.v.filter((v) => right.has(v)).length;
      const miss = a.v.filter((v) => !right.has(v)).length;
      return Math.max(0, (hit - miss) / right.size);
    }
    case 'order':
      return a?.t === 'order' && a.v.length === item.steps.length ? orderScore(a.v, item.steps.length) : 0;
    case 'match':
      return a?.t === 'match' ? a.v.filter((v, i) => v === i).length / item.pairs.length : 0;
    case 'text':
      if (!a || a.t !== 'text' || !a.v.trim()) return 0;
      return selfMarks ? selfMarks.filter(Boolean).length / item.rubric.length : null;
    default:
      return auto ? auto.score : 0;
  }
}

export function aggregate(
  exam: Exam,
  plan: AttemptPlan,
  itemById: (id: string) => Item,
  answers: Record<string, Answer>,
  auto: Record<string, AutoResult>,
  selfMarks: Record<string, boolean[]>,
): ExamResult {
  const items: ItemScore[] = [];
  const sections: SectionResult[] = [];
  let pending = false;
  for (const s of exam.sections) {
    const ids = plan.sections.find((p) => p.id === s.id)?.items ?? [];
    let sum = 0;
    let w = 0;
    for (const id of ids) {
      const item = itemById(id);
      const score = scoreItem(item, answers[id], auto[id], selfMarks[id]);
      if (score === null) pending = true;
      items.push({ id, score, weight: item.weight, competency: item.competency, answered: isAnswered(item, answers[id]) || !!auto[id]?.notes.some((n) => n.ok) });
      sum += item.weight * (score ?? 0);
      w += item.weight;
    }
    sections.push({ id: s.id, title: s.title, share: s.share, score: w ? sum / w : 0 });
  }
  const shares = sections.reduce((t, s) => t + s.share, 0);
  const total = shares ? sections.reduce((t, s) => t + s.share * s.score, 0) / shares : 0;

  const byComp = new Map<CompetencyId, { sum: number; w: number; n: number }>();
  for (const it of items) {
    const c = byComp.get(it.competency) ?? { sum: 0, w: 0, n: 0 };
    c.sum += it.weight * (it.score ?? 0);
    c.w += it.weight;
    c.n++;
    byComp.set(it.competency, c);
  }
  const competencies = [...byComp].map(([id, c]) => ({ id, score: c.w ? c.sum / c.w : 0, weight: c.w, items: c.n }));
  return { total, pending, sections, competencies, items };
}

export interface Band {
  min: number;
  label: string;
  text: string;
}
export const BANDS: Band[] = [
  { min: 0.93, label: 'Высокий результат по программе', text: 'Материал справочника освоен глубоко и применяется в сложных ситуациях.' },
  { min: 0.85, label: 'Сильная подготовка junior', text: 'Готовность браться за задачи, которые обычно доверяют аналитику уровня middle, — под присмотром.' },
  { min: 0.75, label: 'Уверенный junior', text: 'Фундамент освоен, большинство ситуаций разобрано верно.' },
  { min: 0.6, label: 'Фундамент junior', text: 'База есть, но в части областей ошибки системные — их стоит повторить.' },
  { min: 0, label: 'База не закреплена', text: 'Вернитесь к модулям маршрута по слабым областям и пройдите практику ещё раз.' },
];
export const band = (total: number) => BANDS.find((b) => total >= b.min - 1e-9)!;

/** Слабые области: компетенции ниже порога. */
export const weakCompetencies = (r: ExamResult, threshold = 0.6) => r.competencies.filter((c) => c.score < threshold).sort((a, b) => a.score - b.score);
