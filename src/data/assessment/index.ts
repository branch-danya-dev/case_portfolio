/** Контент аттестации: банк заданий, кейсы, экзамены. Интерфейс и self-test импортируют отсюда. */
import { COMPETENCIES } from './competencies';
import { EXAMS } from './exams';
import { PRACTICE } from './practice';
import { THEORY_FOUNDATION } from './theory-foundation';
import { THEORY_FINAL } from './theory-final';
import { LIMITS_CASE } from './cases/limits';
import type { ExamCase, ExamId, Item } from './types';

export { COMPETENCIES, EXAMS };
export const CASES: ExamCase[] = [LIMITS_CASE];

/** Все задания: теория, практика и задания кейсов. */
export const ALL_ITEMS: Item[] = [...THEORY_FOUNDATION, ...THEORY_FINAL, ...PRACTICE, ...CASES.flatMap((c) => c.items)];

const index = new Map(ALL_ITEMS.map((i) => [i.id, i]));
export const itemById = (id: string): Item => {
  const it = index.get(id);
  if (!it) throw new Error(`Нет задания ${id}`);
  return it;
};
export const examById = (id: ExamId) => EXAMS.find((e) => e.id === id)!;
export const caseById = (id: string) => CASES.find((c) => c.id === id);
