/**
 * Попытки аттестации в localStorage (через src/scripts/storage.ts, ключ sa:assessment:attempts).
 * Храним только то, что нужно для восстановления и истории: план (id заданий), ответы, журналы
 * HTTP-заданий (урезанные), результаты автопроверки, самопроверку и итог. Тексты заданий не храним.
 */
import { load, save } from '../../scripts/storage';
import type { Exchange } from '../api-lab/mock';
import type { ExamId } from '../../data/assessment/types';
import type { Answer, AutoResult, ExamResult } from './score';
import type { AttemptPlan } from './select';

export const ATTEMPTS_KEY = 'assessment:attempts';
const MAX_LOG = 20;
const MAX_BODY = 2000;

export interface Attempt {
  id: string;
  exam: ExamId;
  plan: AttemptPlan;
  startedAt: number;
  finishedAt?: number;
  /** Последнее открытое задание — чтобы вернуться туда же. */
  current: string;
  answers: Record<string, Answer>;
  /** Журналы HTTP-заданий: запросы к учебному серверу по каждому заданию. */
  logs: Record<string, Exchange[]>;
  auto: Record<string, AutoResult>;
  selfMarks: Record<string, boolean[]>;
  /** Кэш итога для истории; пересчитывается при самопроверке. */
  result?: Pick<ExamResult, 'total' | 'pending'> & { competencies: { id: string; score: number }[]; sections: { id: string; score: number }[] };
}

export function loadAttempts(): Attempt[] {
  return load<Attempt[]>(ATTEMPTS_KEY, []);
}

export function saveAttempt(a: Attempt) {
  const all = loadAttempts().filter((x) => x.id !== a.id);
  save(ATTEMPTS_KEY, [...all, a].sort((x, y) => x.startedAt - y.startedAt));
}

export function deleteAttempts(exam?: ExamId) {
  save(ATTEMPTS_KEY, exam ? loadAttempts().filter((a) => a.exam !== exam) : []);
}

export const activeAttempt = (exam: ExamId) => loadAttempts().find((a) => a.exam === exam && !a.finishedAt);
export const finishedAttempts = (exam: ExamId) => loadAttempts().filter((a) => a.exam === exam && a.finishedAt);

/** Урезать журнал перед сохранением: последние MAX_LOG обменов, тела до MAX_BODY символов. */
export function compactLog(log: Exchange[]): Exchange[] {
  const cut = (s: string) => (s.length > MAX_BODY ? s.slice(0, MAX_BODY) + '…' : s);
  return log.slice(-MAX_LOG).map((e) => ({
    ...e,
    req: { ...e.req, body: cut(e.req.body) },
    res: { ...e.res, body: cut(e.res.body) },
  }));
}

/** Статус экзамена для главной и маршрута. */
export type ExamStatus = { state: 'none' } | { state: 'active' } | { state: 'tried'; best: number } | { state: 'passed'; best: number };

export function examStatus(exam: ExamId, pass: number): ExamStatus {
  const done = finishedAttempts(exam).filter((a) => a.result);
  if (!done.length) return activeAttempt(exam) ? { state: 'active' } : { state: 'none' };
  const best = Math.max(...done.map((a) => a.result!.total));
  return best * 100 >= pass ? { state: 'passed', best } : { state: 'tried', best };
}
