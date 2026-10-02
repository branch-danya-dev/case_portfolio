// Интерактивные инструменты (раздел tools/). ready: false — ещё не сделан: на главной показывается как «в работе».
export const tools = [
  { slug: 'tools/artifact-generator', label: 'Генератор шаблонов артефактов', description: 'User story + Gherkin, use case, ФТ, НФТ, ADR, интеграция → Markdown с проверкой', ready: true },
  { slug: 'tools/mermaid-sandbox', label: 'Песочница Mermaid', description: 'Редактор с живым превью и экспортом в SVG', ready: true },
  { slug: 'tools/http-reference', label: 'Справочник HTTP', description: 'Методы и коды ответов: когда что возвращать, можно ли повторять', ready: true },
  { slug: 'tools/interview-trainer', label: 'Тренажёр для собеседования', description: 'Карточки и экзамен по банку вопросов, самооценка, прогресс по темам', ready: true },
  { slug: 'tools/availability', label: 'Калькулятор доступности', description: 'Процент ↔ простой, часы обслуживания, цепочка систем, MTBF и MTTR', ready: true },
  { slug: 'tools/requirements-linter', label: 'Линтер требований', description: 'Размытые формулировки, атомарность, проверяемость, INVEST', ready: true },
  { slug: 'tools/prioritization', label: 'Приоритизация', description: 'MoSCoW-доска, RICE, WSJF', ready: false },
  { slug: 'tools/raci', label: 'Конструктор RACI', description: 'Роли × артефакты, проверка «одна A»', ready: false },
  { slug: 'tools/json-yaml', label: 'JSON / YAML', description: 'Форматирование, конвертация, JSON Schema', ready: false },
  { slug: 'tools/sql-trainer', label: 'SQL-тренажёр', description: 'Учебная БД кейса, задания с проверкой', ready: false },
  { slug: 'tools/bpmn-editor', label: 'BPMN-редактор', description: 'Создать, открыть, отредактировать, сохранить .bpmn', ready: true },
  { slug: 'tools/openapi-viewer', label: 'Просмотрщик OpenAPI', description: 'Своя спецификация и спецификации кейса', ready: false },
];
