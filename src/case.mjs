// Слои кейса IDM-JOINER: папка в source/ → папка на сайте, подпись, вопрос слоя.
// Используется скриптом импорта, сайдбаром (src/sections.mjs) и компонентом CaseLayers.
export const CASE_LAYERS = [
  { source: '00_project', dir: '00-project', label: '00 · Проект: зачем', question: 'Зачем проект, где границы, кто участвует', contents: 'Устав, стейкхолдеры и RACI, глоссарий' },
  { source: '01_business', dir: '01-business', label: '01 · Бизнес: что меняется', question: 'Как сейчас, как будет, что нужно бизнесу', contents: 'AS-IS, TO-BE (BPMN), gap-анализ, бизнес-требования' },
  { source: '02_requirements', dir: '02-requirements', label: '02 · Требования: что делает система', question: 'Что должна делать система', contents: 'Use cases, ФТ, НФТ, ролевая модель, бэклог, трассировка' },
  { source: '03_architecture', dir: '03-architecture', label: '03 · Архитектура: как устроена', question: 'Из чего состоит, что хранит, как живут объекты', contents: 'C4, модель данных, статусные модели, ADR' },
  { source: '04_integrations', dir: '04-integrations', label: '04 · Интеграции: с кем и как', question: 'С кем и как обменивается данными', contents: 'Карта интеграций, sequence, маппинг, OpenAPI и AsyncAPI' },
  { source: '05_security', dir: '05-security', label: '05 · Безопасность', question: 'Какие ограничения ИБ действуют', contents: 'Требования ИБ' },
  { source: '06_rollout', dir: '06-rollout', label: '06 · Внедрение: как перейти', question: 'Как перейти от старого к новому', contents: 'Миграция данных, план внедрения, план релиза' },
  { source: '07_testing', dir: '07-testing', label: '07 · Тестирование: как доказать', question: 'Как доказать, что работает', contents: 'ПМИ, тест-кейсы' },
  { source: '08_operations', dir: '08-operations', label: '08 · Эксплуатация: как жить дальше', question: 'Как сопровождать систему и разбирать сбои', contents: 'Модель сопровождения, runbook, мониторинг, инцидент, разбор проблемы, запрос на изменение' },
];

/** Элементы сайдбара раздела «Кейс IDM-JOINER». */
export const caseSidebar = [
  { label: 'Обзор и навигация', link: '/case/' },
  { label: 'Шпаргалка кейса', link: '/case/cheatsheet/' },
  ...CASE_LAYERS.map((l) => ({ label: l.label, collapsed: true, items: [{ autogenerate: { directory: `case/${l.dir}` } }] })),
  { label: 'Все диаграммы', link: '/case/diagrams/' },
  { label: 'Скачать файлы', link: '/case/downloads/' },
];
