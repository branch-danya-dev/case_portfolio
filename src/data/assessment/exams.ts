/** Схемы экзаменов: разделы, доли в итоговом балле, правила выборки, пороги. Дизайн — ASSESSMENT.md. */
import type { Exam } from './types';

export const FOUNDATION: Exam = {
  id: 'foundation',
  title: 'Foundation Exam',
  short: 'Базовый экзамен',
  description: 'Фундамент уровня junior после модулей 1–4 маршрута: требования, процессы, моделирование, данные, интеграции, основы архитектуры, тестирования и безопасности.',
  pass: 70,
  sections: [
    {
      id: 'theory',
      kind: 'theory',
      title: 'Теория',
      share: 60,
      pick: [
        { competency: 'requirements', count: 4 },
        { competency: 'processes', count: 2 },
        { competency: 'modeling', count: 3 },
        { competency: 'data', count: 3 },
        { competency: 'integrations', count: 5 },
        { competency: 'architecture', count: 2 },
        { competency: 'testing', count: 2 },
        { competency: 'security', count: 1 },
      ],
    },
    {
      id: 'practice',
      kind: 'practice',
      title: 'Практика',
      share: 40,
      pick: [
        { competency: 'data', count: 2, types: ['sql'] },
        { competency: 'integrations', count: 2, types: ['http'] },
      ],
      fixed: ['f-json-visitor', 'f-oas-visitors', 'f-req-rewrite'],
    },
  ],
};



export const FINAL: Exam = {
  id: 'final',
  title: 'System Analyst Final',
  short: 'Итоговый экзамен',
  description:
    'Итоговая проверка после всего маршрута: способность провести задачу через жизненный цикл — от запроса заказчика до релиза и разбора инцидента. Сквозной кейс — незнакомый проект с неполными и противоречивыми данными.',
  pass: 75,
  cases: ['limits'],
  sections: [
    {
      id: 'theory',
      kind: 'theory',
      title: 'Теория',
      share: 25,
      pick: [
        { competency: 'requirements', count: 1 },
        { competency: 'modeling', count: 1 },
        { competency: 'data', count: 1 },
        { competency: 'integrations', count: 2 },
        { competency: 'architecture', count: 1 },
        { competency: 'security', count: 2 },
        { competency: 'project', count: 2 },
        { competency: 'testing', count: 1 },
        { competency: 'delivery', count: 2 },
        { competency: 'operations', count: 1 },
      ],
    },
    {
      id: 'practice',
      kind: 'practice',
      title: 'Техническая практика',
      share: 35,
      fixed: ['fin-sql-last-task', 'fin-http-payment', 'fin-http-etag', 'fin-json-limit-event'],
    },
    { id: 'case', kind: 'case', title: 'Сквозной кейс', share: 40 },
  ],
};
export const EXAMS: Exam[] = [FOUNDATION, FINAL];
