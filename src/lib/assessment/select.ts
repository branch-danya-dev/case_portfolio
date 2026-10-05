/**
 * Сборка попытки по схеме экзамена: обязательные задания + выборка по компетенциям.
 * Каждое правило PickRule берёт ровно count заданий своей компетенции, поэтому ни одна
 * обязательная компетенция не может остаться без заданий; повторов нет.
 */
import type { Exam, ExamCase, Item } from '../../data/assessment/types';
import { rng, shuffle } from './rng';

export interface PlanSection {
  id: string;
  items: string[];
}
export interface AttemptPlan {
  exam: Exam['id'];
  seed: number;
  caseId?: string;
  sections: PlanSection[];
}

export class BlueprintError extends Error {}

/** Пул заданий раздела: свои задания экзамена данного вида. */
export function sectionPool(items: Item[], exam: Exam, kind: Item['kind']) {
  return items.filter((i) => i.kind === kind && i.exams.includes(exam.id));
}

export function buildPlan(exam: Exam, bank: Item[], cases: ExamCase[], seed: number): AttemptPlan {
  const next = rng(seed);
  const used = new Set<string>();
  const byId = new Map(bank.map((i) => [i.id, i]));
  let caseId: string | undefined;

  const sections = exam.sections.map((s) => {
    if (s.kind === 'case') {
      const options = cases.filter((c) => exam.cases?.includes(c.id));
      if (!options.length) throw new BlueprintError(`${exam.id}: нет кейса для раздела ${s.id}`);
      const chosen = options[Math.floor(next() * options.length)];
      caseId = chosen.id;
      return { id: s.id, items: chosen.items.map((i) => i.id) };
    }
    const ids: string[] = [];
    for (const id of s.fixed ?? []) {
      if (!byId.has(id)) throw new BlueprintError(`${exam.id}/${s.id}: нет задания ${id}`);
      ids.push(id);
      used.add(id);
    }
    const pool = sectionPool(bank, exam, s.kind);
    for (const rule of s.pick ?? []) {
      const candidates = pool.filter(
        (i) => i.competency === rule.competency && !used.has(i.id) && (!rule.difficulty || rule.difficulty.includes(i.difficulty)),
      );
      if (candidates.length < rule.count)
        throw new BlueprintError(`${exam.id}/${s.id}: для «${rule.competency}» нужно ${rule.count}, в пуле ${candidates.length}`);
      for (const i of shuffle(candidates, next).slice(0, rule.count)) {
        ids.push(i.id);
        used.add(i.id);
      }
    }
    // Теория — вперемешку, практика — в порядке схемы.
    return { id: s.id, items: s.kind === 'theory' ? shuffle(ids, next) : ids };
  });

  return { exam: exam.id, seed, caseId, sections };
}
