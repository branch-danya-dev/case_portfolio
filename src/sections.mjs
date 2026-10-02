// Единый список разделов: из него строятся сайдбар (astro.config.mjs) и карточки на главной.
// ready: false — раздел ещё не написан. Он не попадает в сайдбар, а на главной
// показывается как «в работе». Так в навигации не бывает битых ссылок.
// Порядок здесь = порядок в сайдбаре. sidebar — свои элементы вместо автогенерации по папке.
import { caseSidebar } from './case.mjs';

/** @typedef {{ id: string, label: string, description: string, icon: string, ready: boolean, collapsed?: boolean, sidebar?: any[], kind?: 'topic' | 'case' | 'practice' | 'tools' | 'reference' }} Section */

/** @type {Section[]} */
export const sections = [
  { id: 'start', label: 'Старт', description: 'Как пользоваться сайтом, карта знаний СА, маршрут изучения', icon: 'rocket', ready: true, kind: 'reference' },
  { id: 'role', label: 'Роль и процесс', description: 'СА и БА, жизненный цикл проекта, артефакты по этапам, RACI', icon: 'notes', ready: true, kind: 'topic' },
  { id: 'elicitation', label: 'Выявление требований', description: 'Источники, интервью, воркшопы, стейкхолдеры, конфликты требований', icon: 'comment', ready: true, kind: 'topic' },
  { id: 'requirements', label: 'Требования', description: 'Уровни, свойства, user stories, use cases, Gherkin, приоритизация, трассировка', icon: 'document', ready: true, kind: 'topic' },
  { id: 'processes', label: 'Процессы', description: 'BPMN 2.0, AS-IS / TO-BE, gap-анализ', icon: 'random', ready: true, kind: 'topic' },
  { id: 'diagrams', label: 'UML и архитектурные диаграммы', description: 'Use case, activity, sequence, state, class, component, deployment, C4, DFD', icon: 'analytics', ready: true, kind: 'topic' },
  { id: 'diagram-howto', label: 'Диаграммы: как создавать', description: 'Практикум: алгоритм, синтаксис Mermaid и PlantUML, редакторы, чек-листы, упражнения', icon: 'pencil', ready: true, kind: 'practice' },
  { id: 'data', label: 'Данные', description: 'Модели данных, ER, нормализация, SQL, транзакции, индексы, НСИ', icon: 'database', ready: true, kind: 'topic' },
  { id: 'integrations', label: 'Интеграции', description: 'REST, SOAP, gRPC, GraphQL, брокеры, паттерны надёжности, контракты, безопасность', icon: 'link', ready: true, kind: 'topic' },
  { id: 'architecture', label: 'Архитектура для аналитика', description: 'Монолит и микросервисы, кэширование, НФТ и ISO/IEC 25010, CAP, ADR', icon: 'server', ready: true, kind: 'topic' },
  { id: 'documentation', label: 'Документирование', description: 'ТЗ по ГОСТ 34, шаблоны, docs-as-code, практики Confluence', icon: 'open-book', ready: true, kind: 'topic' },
  { id: 'methodologies', label: 'Методологии', description: 'Waterfall, Scrum, Kanban, гибриды и место аналитика в каждой', icon: 'clock', ready: true, kind: 'topic' },
  { id: 'testing', label: 'Тестирование для аналитика', description: 'Виды тестирования, тест-дизайн, ПМИ, UAT', icon: 'approve-check', ready: false, kind: 'topic' },
  { id: 'software', label: 'Каталог ПО', description: 'Jira, Confluence, draw.io, Camunda Modeler, Postman, DBeaver и другие: что, когда, зачем', icon: 'desktop', ready: false, kind: 'reference' },
  { id: 'case', label: 'Кейс IDM-JOINER', description: 'Полный учебный проект: от устава до тест-кейсов, с диаграммами и контрактами', icon: 'star', ready: true, collapsed: true, kind: 'case', sidebar: caseSidebar },
  { id: 'interview', label: 'Собеседование', description: 'Вопросы с ответами по темам и практические задачи', icon: 'question-circle', ready: false, kind: 'practice' },
  { id: 'tools', label: 'Инструменты', description: 'Генераторы, песочницы, калькуляторы, тренажёры — всё работает в браузере', icon: 'setting', ready: true, kind: 'tools' },
  { id: 'cheatsheets', label: 'Шпаргалки для печати', description: 'Каждый раздел на 1–2 листах A4', icon: 'add-document', ready: true, collapsed: true, kind: 'reference' },
  { id: 'glossary', label: 'Глоссарий', description: 'Термины с английским оригиналом и фильтром', icon: 'magnifier', ready: false, kind: 'reference' },
];
