// Интерактивные инструменты (раздел tools/). ready: false — ещё не сделан: на главной показывается как «в работе».
export const tools = [
  { slug: 'tools/artifact-generator', label: 'Генератор шаблонов артефактов', description: 'User story + Gherkin, use case, ФТ, НФТ, ADR, интеграция → Markdown с проверкой', ready: true },
  { slug: 'tools/mermaid-sandbox', label: 'Песочница Mermaid', description: 'Редактор с живым превью и экспортом в SVG', ready: true },
  { slug: 'tools/http-reference', label: 'Справочник HTTP', description: 'Методы и коды ответов: когда что возвращать, можно ли повторять', ready: true },
  { slug: 'tools/interview-trainer', label: 'Тренажёр для собеседования', description: 'Карточки и экзамен по банку вопросов, самооценка, прогресс по темам', ready: true },
  { slug: 'tools/availability', label: 'Калькулятор доступности', description: 'Процент ↔ простой, часы обслуживания, цепочка систем, MTBF и MTTR', ready: true },
  { slug: 'tools/requirements-linter', label: 'Линтер требований', description: 'Размытые формулировки, атомарность, проверяемость, INVEST', ready: true },
  { slug: 'tools/prioritization', label: 'Приоритизация', description: 'MoSCoW-доска, RICE, WSJF с сортировкой и экспортом', ready: true },
  { slug: 'tools/raci', label: 'Конструктор RACI', description: 'Роли × артефакты, проверка «одна A», экспорт Markdown и CSV', ready: true },
  { slug: 'tools/json-yaml', label: 'JSON / YAML', description: 'Форматирование, конвертация, проверка по JSON Schema', ready: true },
  { slug: 'tools/sql-trainer', label: 'SQL-тренажёр', description: '17 заданий на учебной БД кейса с проверкой, свободный режим', ready: true },
  { slug: 'tools/bpmn-editor', label: 'BPMN-редактор', description: 'Создать, открыть, отредактировать, сохранить .bpmn', ready: true },
  { slug: 'tools/openapi-viewer', label: 'Просмотрщик OpenAPI', description: 'Своя спецификация и API кейса, ревью-чек контракта', ready: true },
];
