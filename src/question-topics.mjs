// Порядок тем банка вопросов (src/data/questions/<тема>.yaml): сводка, тренажёр, страница частых вопросов.
export const QUESTION_TOPIC_ORDER = ['experience', 'role', 'onboarding', 'elicitation', 'requirements', 'bpmn', 'processes', 'diagrams', 'data', 'integrations', 'architecture', 'security', 'documentation', 'methodologies', 'testing', 'release', 'operations', 'software', 'case'];

/** Индекс темы для сортировки; неизвестные темы — в конец. */
export const topicRank = (id) => {
  const i = QUESTION_TOPIC_ORDER.indexOf(id);
  return i < 0 ? 99 : i;
};
