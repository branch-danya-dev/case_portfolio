# Справочник системного аналитика — соглашения проекта

Локальный офлайн-сайт на Astro 7 + Starlight 0.42: шпаргалки и разборы по темам СА, интерактивные инструменты, банк вопросов, учебный кейс IDM-JOINER. Язык сайта — русский. План и прогресс — `ROADMAP.md`. Непроверенные факты — `TODO-CHECK.md`.

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | Синхронизирует файлы кейса, рендерит PlantUML, запускает dev-сервер (поиск в dev не работает) |
| `npm run build` | То же + сборка + проверка ссылок (starlight-links-validator) + проверка офлайна (`scripts/check-offline.mjs`) |
| `npm run preview` | Раздаёт `dist/`; здесь работает поиск Pagefind |
| `npm run setup:plantuml` | Один раз скачивает `vendor/plantuml.jar` (единственный шаг, которому нужна сеть) |
| `npm run render:puml` | Принудительно перерисовать все `.puml` |
| `npm run import:case` | Перегенерировать страницы кейса из `source/` (перезаписывает только файлы с пометкой GENERATED) |

## Структура

```
source/idm-joiner-docs/      исходники кейса — НЕ редактировать (канон; копируются в public/case-files/)
src/content/docs/case/       кейс: сгенерировано scripts/import-case.mjs (GENERATED) + ручные страницы (diagrams, downloads, api-*)
src/case.mjs                 слои кейса и сайдбар раздела
src/content/docs/<раздел>/   страницы (MDX); разделы перечислены в src/sections.mjs
src/sections.mjs             список разделов: сайдбар и карточки главной; ready:false = скрыт из сайдбара
src/tools.mjs                список инструментов для главной
src/data/questions/<тема>.yaml  банк вопросов (коллекция questions)
src/data/glossary.yaml       глоссарий (коллекция glossary)
src/data/software.yaml       каталог ПО (коллекция software) → <SoftwareCatalog group="…">
src/components/              компоненты шаблона, просмотрщики; overrides/ — переопределения Starlight
src/plugins/remark-mermaid.mjs  ```mermaid → <figure data-mermaid>, рисует src/scripts/mermaid.ts
src/diagrams/**.puml         PlantUML-примеры сайта → public/diagrams/site/
public/diagrams/             SVG из PlantUML (коммитятся; сборка работает без Java)
public/bpmn/examples/        учебные .bpmn сайта
public/case-files/           генерируется (gitignore): копия кейса + idm-joiner-docs.zip
public/vendor/               генерируется (gitignore): Redoc standalone (scripts/vendor-assets.mjs)
templates/topic-page.mdx     шаблон тематической страницы
```

## Шаблон тематической страницы

Порядок блоков строгий (эталон — `src/content/docs/processes/bpmn.mdx`):

1. `<Brief>` — «Кратко», 3–5 строк.
2. `## Когда применять` — таблица «Применять / Не нужно».
3. `## Как делать` — `<Steps>`.
4. `## Нотация` (или «Шаблон») — таблица элементов / блок кода для копирования.
5. `## Пример из кейса IDM-JOINER` — с `<CaseRef>` на артефакт.
6. `## Типичные ошибки` — таблица «Ошибка / Чем плохо / Как правильно».
7. `## Вопросы на собеседовании` — `<InterviewQuestions topic="…" />` (ответы в `<details>`).
8. `## Связанные темы` — `<Related pages={[…]} planned={[…]} />`.

Во frontmatter: `trackProgress: true` (кнопка «Изучено» + общий прогресс), `sidebar.order`. Если в `title` или `description` есть «: » — значение в двойных кавычках (иначе YAML ломается).

Страницы практикума `diagram-howto/` используют свой шаблон: алгоритм → синтаксис Mermaid/PlantUML во вкладках → визуальный редактор → чек-лист → «до и после» → упражнение с решением в `<details>`.

## Стиль текста

- Тон и глубина — как в `source/CHEATSHEET.md`: кратко, конкретно, с примерами из кейса, без воды.
- Термин при первом упоминании — с английским оригиналом: «шлюз (gateway)».
- Примеры — из IDM-JOINER с ID артефактов (FR-08, BRL-02, SEQ-02).
- **Фактическая точность важнее объёма.** Не выдумывать номера разделов стандартов, версии, цитаты, горячие клавиши и пункты меню. Если не уверен — `<Check id="тема-NN">` и строка в `TODO-CHECK.md` с тем же id.
- Ё пишем. Кавычки «ёлочки». Тире — «—», диапазоны — «–».

## Технические правила

- **Офлайн:** никаких CDN, внешних шрифтов, `fetch` наружу. Шрифты — `@fontsource-variable/*`. Всё тяжёлое (mermaid, bpmn-js) — из npm, лениво. `check-offline.mjs` валит сборку при внешних загрузках; обычные `<a href="https://…">` разрешены.
- **MDX:** «<» перед кириллицей и «{» в тексте ломают сборку — экранировать (`\<`, `\{`) или брать в `код`. `scripts/lint-mdx.mjs` (часть `prepare:assets`) ловит это заранее.
- Когда пишется новая страница, темы из `planned` других страниц переводятся в ссылки: `node scripts/promote-related.mjs "Название=раздел/slug"`.
- **Ссылки:** только абсолютные (`/processes/bpmn/`), относительные запрещены валидатором. Ссылки на страницы, которых ещё нет, не ставить — использовать `planned` в `<Related>` или текст без ссылки.
- Компоненты с `href`, которые нужно проверять, регистрируются в `astro.config.mjs` → `starlightLinksValidator.components`.
- Внутри MDX сырой `<pre>` обрабатывается Expressive Code — для «сырого» текста использовать `div` с `white-space: pre`.
- Страницы кейса с пометкой GENERATED не править руками — править source/ и запускать `npm run import:case`.
- Широкие страницы (Redoc, песочница, редактор) расширяют колонку через `:root:has(...)` в custom.css.
- Острова React — `client:visible` (просмотрщики) или `client:load` (инструменты на отдельной странице).
- localStorage — только через `src/scripts/storage.ts` (префикс `sa:`).
- Markdown-процессор — `unified()` из `@astrojs/markdown-remark` (в Astro 7 по умолчанию Sätteri, а нам нужны remark-плагины).
- Новый раздел: создать страницы → `ready: true` в `src/sections.mjs`. Новый инструмент: страница → `ready: true` в `src/tools.mjs`.

## Порядок работы

Этапами (см. `ROADMAP.md`). После каждого этапа: `npm run build` без ошибок, ссылки валидны, офлайн-проверка зелёная → коммит → короткий отчёт пользователю.
