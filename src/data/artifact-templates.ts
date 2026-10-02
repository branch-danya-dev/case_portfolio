/**
 * Шаблоны генератора артефактов (инструмент tools/artifact-generator).
 * Формат каждого шаблона совпадает с шаблонами на тематических страницах:
 * история — requirements/user-stories, use case — requirements/use-cases, НФТ — architecture/nfr-iso25010,
 * ADR — architecture/adr, интеграция — documentation/templates.
 * Пример у каждого шаблона — артефакт кейса IDM-JOINER.
 */
import { findVague } from '../lib/vague-words';

export type FieldType = 'text' | 'textarea' | 'lines' | 'select';
export interface Field {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  hint?: string;
  options?: string[];
  /** Ширина в форме: полная строка или половина. */
  half?: boolean;
}
export type Values = Record<string, string>;
export interface Warning {
  field?: string;
  text: string;
}
export interface ArtifactTemplate {
  id: string;
  label: string;
  description: string;
  /** Страница справочника с описанием артефакта. */
  page: string;
  fields: Field[];
  render: (v: Values) => string;
  check: (v: Values) => Warning[];
  filename: (v: Values) => string;
  example: Values;
}

// ---------- помощники ----------
const lines = (s = '') =>
  s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
const cells = (line: string) => line.split('|').map((c) => c.trim());
const or = (s: string | undefined, ph: string) => (s && s.trim() ? s.trim() : `<${ph}>`);
const esc = (s: string) => s.replace(/\|/g, '\\|');
const slug = (s: string) =>
  (s || 'artifact')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
const vague = (field: string, text: string, label: string): Warning[] =>
  text ? findVague(text).map((w) => ({ field, text: `${label}: «${w.word}» — ${w.hint}` })) : [];
const required = (v: Values, ids: [string, string][]): Warning[] =>
  ids.filter(([id]) => !v[id]?.trim()).map(([id, label]) => ({ field: id, text: `Не заполнено: ${label}` }));

// ---------- User story + Gherkin ----------
const story: ArtifactTemplate = {
  id: 'story',
  label: 'User story + Gherkin',
  description: 'История пользователя с критериями приёмки и сценариями Gherkin',
  page: '/requirements/user-stories/',
  fields: [
    { id: 'id', label: 'ID', type: 'text', placeholder: 'US-02', half: true },
    { id: 'title', label: 'Короткое название', type: 'text', placeholder: 'Уникальный логин', half: true },
    { id: 'links', label: 'Эпик и требования', type: 'text', placeholder: 'EPIC-02, FR-06' },
    { id: 'role', label: 'Как (роль)', type: 'text', placeholder: 'администратор AD' },
    { id: 'want', label: 'Я хочу (действие)', type: 'text', placeholder: 'чтобы логин генерировался по единому правилу' },
    { id: 'benefit', label: 'Чтобы (ценность)', type: 'text', placeholder: 'не разбирать коллизии вручную' },
    { id: 'criteria', label: 'Критерии приёмки — по одному в строке', type: 'lines' },
    {
      id: 'gherkin',
      label: 'Сценарии Gherkin',
      type: 'textarea',
      hint: 'Сценарий / Дано / Когда / Тогда / И — по строке на шаг',
      placeholder: 'Сценарий: …\n  Дано …\n  Когда …\n  Тогда …',
    },
    { id: 'notes', label: 'Заметки: интеграции, макеты, зависимости', type: 'textarea' },
  ],
  render: (v) => {
    const head = `### ${or(v.id, 'US-NN')}. ${or(v.title, 'Короткое название')}${v.links?.trim() ? ` (${v.links.trim()})` : ''}`;
    const body = `Как ${or(v.role, 'роль')}, я хочу ${or(v.want, 'действие')}, чтобы ${or(v.benefit, 'ценность')}.`;
    const parts = [head, '', body];
    const crit = lines(v.criteria);
    if (crit.length || v.gherkin?.trim()) {
      parts.push('', '**Критерии приёмки**');
      if (crit.length) parts.push('', ...crit.map((c) => `- ${c}`));
      if (v.gherkin?.trim()) parts.push('', '```gherkin', v.gherkin.replace(/\s+$/, ''), '```');
    }
    if (v.notes?.trim()) parts.push('', `**Заметки:** ${v.notes.trim()}`);
    return parts.join('\n') + '\n';
  },
  check: (v) => {
    const w = required(v, [
      ['role', 'роль'],
      ['want', 'действие'],
      ['benefit', 'ценность («чтобы…») — без неё история превращается в задачу'],
    ]);
    if (!lines(v.criteria).length && !v.gherkin?.trim()) w.push({ field: 'criteria', text: 'Нет критериев приёмки — историю нельзя принять' });
    if (v.gherkin?.trim()) {
      const g = v.gherkin;
      if (!/Тогда|Then/i.test(g)) w.push({ field: 'gherkin', text: 'В сценарии нет шага «Тогда» — нечего проверять' });
      if (!/Когда|When/i.test(g)) w.push({ field: 'gherkin', text: 'В сценарии нет шага «Когда» — непонятно действие' });
      if ((g.match(/Сценарий|Scenario/gi) ?? []).length === 1) w.push({ field: 'gherkin', text: 'Один сценарий — есть ли негативный или граничный случай?' });
    }
    return [...w, ...vague('want', v.want, 'Действие'), ...vague('criteria', v.criteria, 'Критерии')];
  },
  filename: (v) => `${slug(v.id || 'us')}-${slug(v.title)}.md`,
  example: {
    id: 'US-02',
    title: 'Уникальный логин',
    links: 'EPIC-02, FR-06',
    role: 'администратор AD',
    want: 'чтобы логин генерировался по единому правилу',
    benefit: 'не разбирать коллизии вручную',
    criteria: 'Логин строится по правилу раздела 2.1 ФТ\nДлина логина — не более 20 символов, при превышении усекается фамилия',
    gherkin:
      'Сценарий: Коллизия логина\n  Дано в AD существует учётная запись "ivanov.ap"\n  Когда принимается сотрудник "Иванов Андрей Павлович"\n  Тогда ему назначается логин "ivanov.ap2"\n\nСценарий: Длинная фамилия\n  Когда принимается сотрудник "Константинопольский Ярослав Юрьевич"\n  Тогда ему назначается логин "konstantinopolski.ii" длиной 20 символов',
    notes: 'Проверка уникальности — среди действующих учётных записей AD и зарезервированных логинов (BRL-05).',
  },
};

// ---------- Use case ----------
const usecase: ArtifactTemplate = {
  id: 'usecase',
  label: 'Use case',
  description: 'Спецификация варианта использования: акторы, условия, потоки',
  page: '/requirements/use-cases/',
  fields: [
    { id: 'id', label: 'ID', type: 'text', placeholder: 'UC-01', half: true },
    { id: 'name', label: 'Название (глагол + объект)', type: 'text', placeholder: 'Обработать кадровое событие о приёме', half: true },
    { id: 'primary', label: 'Основной актор', type: 'text', half: true },
    { id: 'secondary', label: 'Второстепенные акторы', type: 'text', half: true },
    { id: 'goal', label: 'Цель актора', type: 'text' },
    { id: 'pre', label: 'Предусловия', type: 'text' },
    { id: 'trigger', label: 'Триггер', type: 'text' },
    { id: 'postOk', label: 'Постусловия (успех)', type: 'text' },
    { id: 'postFail', label: 'Постусловия (неуспех)', type: 'text' },
    { id: 'reqs', label: 'Связанные требования', type: 'text' },
    { id: 'main', label: 'Основной поток — шаг в строке, без номеров', type: 'lines' },
    { id: 'alt', label: 'Альтернативные потоки — «3a. Условие: что происходит»', type: 'lines' },
    { id: 'exc', label: 'Исключения — «2a. Ошибка: реакция системы»', type: 'lines' },
  ],
  render: (v) => {
    const row = (k: string, val: string | undefined) => `| ${k} | ${esc(val?.trim() ?? '')} |`;
    const parts = [
      `## ${or(v.id, 'UC-NN')}. ${or(v.name, 'Глагол + объект')}`,
      '',
      '| Поле | Значение |',
      '|---|---|',
      row('Основной актор', v.primary),
      row('Второстепенные акторы', v.secondary),
      row('Цель актора', v.goal),
      row('Предусловия', v.pre),
      row('Триггер', v.trigger),
      row('Постусловия (успех)', v.postOk),
      row('Постусловия (неуспех)', v.postFail),
      row('Связанные требования', v.reqs),
      '',
      '**Основной поток**',
      '',
      ...(lines(v.main).length ? lines(v.main).map((s, i) => `${i + 1}. ${s.replace(/^\d+\.\s*/, '')}`) : ['1. <Актор> <действие>.']),
    ];
    if (lines(v.alt).length) parts.push('', '**Альтернативные потоки**', '', ...lines(v.alt).map((s) => `- ${s}`));
    if (lines(v.exc).length) parts.push('', '**Исключения**', '', ...lines(v.exc).map((s) => `- ${s}`));
    return parts.join('\n') + '\n';
  },
  check: (v) => {
    const w = required(v, [
      ['name', 'название'],
      ['primary', 'основной актор'],
      ['trigger', 'триггер'],
      ['postOk', 'постусловие успеха'],
    ]);
    const main = lines(v.main);
    if (main.length < 3) w.push({ field: 'main', text: 'В основном потоке меньше трёх шагов — это точно пользовательская цель?' });
    const bad = [...lines(v.alt), ...lines(v.exc)].filter((s) => !/^\d+[a-zа-я]\./i.test(s));
    if (bad.length) w.push({ field: 'alt', text: `Альтернатива или исключение без привязки к шагу (формат «3a.»): «${bad[0]}»` });
    const outOfRange = [...lines(v.alt), ...lines(v.exc)].filter((s) => {
      const n = Number(s.match(/^(\d+)/)?.[1]);
      return n > main.length && main.length > 0;
    });
    if (outOfRange.length) w.push({ field: 'alt', text: `Ссылка на несуществующий шаг: «${outOfRange[0]}»` });
    if (!lines(v.exc).length) w.push({ field: 'exc', text: 'Нет исключений — что будет при ошибке?' });
    if (/нажима|кликае|кнопк|экран/i.test(v.main ?? '')) w.push({ field: 'main', text: 'В шагах детали интерфейса — описывайте действие, а не клик' });
    return w;
  },
  filename: (v) => `${slug(v.id || 'uc')}-${slug(v.name)}.md`,
  example: {
    id: 'UC-01',
    name: 'Обработать кадровое событие о приёме',
    primary: 'Кадровая система (HRMS)',
    secondary: 'AD, Exchange, АБС, ServiceDesk',
    goal: 'Новый сотрудник получает доступы, соответствующие должности, к первому рабочему дню',
    pre: 'Приказ о приёме проведён в HRMS; событие `HIRE` опубликовано в шину',
    trigger: 'Событие `HIRE` в топике `hr.employee.events.v1`',
    postOk: 'Идентичность в статусе `PRE_HIRE`; учётные записи созданы в статусе `CREATED_DISABLED`; активация запланирована',
    postFail: 'Событие в DLQ, создан инцидент; доступы не выдаются',
    reqs: 'FR-01 … FR-12, FR-15 … FR-17, FR-21',
    main: [
      'IdM получает событие `HIRE`.',
      'IdM проверяет обязательные поля и уникальность `eventId` (FR-02, FR-03).',
      'IdM ищет идентичность по `personId`; не находит и создаёт новую (FR-04).',
      'IdM генерирует уникальный логин (FR-06).',
      'IdM назначает базовую роль и бизнес-роли по правилам назначения (FR-09, FR-10).',
      'IdM проверяет SoD-правила — конфликтов нет (FR-12).',
      'IdM планирует создание учётных записей на дату «дата выхода − 3 рабочих дня» (FR-07).',
      'В запланированную дату IdM создаёт заблокированные учётные записи в AD, Exchange, АБС и задачу в ServiceDesk для СЭД (FR-15, FR-17).',
      'IdM записывает все операции в журнал аудита (FR-21).',
    ].join('\n'),
    alt: [
      '3a. Найдена идентичность с завершённым трудоустройством (повторный приём): используется прежняя идентичность, создаётся новое трудоустройство (BRL-05).',
      '3b. Найдена идентичность с активным трудоустройством (внутреннее совместительство): учётная запись AD не создаётся, к идентичности добавляются роли нового трудоустройства (BRL-07).',
      '4a. Логин занят: добавляется цифровой суффикс (FR-06).',
      '5a. Правило назначения роли не найдено: назначается только базовая роль, руководитель и владелец ролевой модели получают уведомление (FR-11).',
      '7a. До даты выхода меньше 3 рабочих дней: создание выполняется сразу.',
    ].join('\n'),
    exc: [
      '2a. Событие не прошло проверку: событие помещается в DLQ, группе сопровождения HRMS создаётся инцидент (FR-02).',
      '2b. `eventId` уже обработан: событие подтверждается без побочных эффектов (FR-03).',
      '8a. Целевая система вернула техническую ошибку: повторы по политике FR-16, затем задача в ServiceDesk.',
    ].join('\n'),
  },
};

// ---------- Функциональные требования ----------
const fr: ArtifactTemplate = {
  id: 'fr',
  label: 'Функциональные требования',
  description: 'Таблица ФТ с нумерацией, источником и приоритетом',
  page: '/requirements/quality/',
  fields: [
    { id: 'prefix', label: 'Префикс ID', type: 'text', placeholder: 'FR', half: true },
    { id: 'start', label: 'Первый номер', type: 'text', placeholder: '1', half: true },
    {
      id: 'items',
      label: 'Требования — «текст | источник | приоритет» в строке',
      type: 'lines',
      hint: 'Приоритет по MoSCoW: M, S, C, W',
      placeholder: 'IdM должна … | BR-01 | M',
    },
  ],
  render: (v) => {
    const prefix = v.prefix?.trim() || 'FR';
    const start = Number.parseInt(v.start || '1', 10) || 1;
    const rows = lines(v.items).map((l, i) => {
      const [text = '', src = '', prio = ''] = cells(l);
      return `| ${prefix}-${String(start + i).padStart(2, '0')} | ${esc(text)} | ${esc(src)} | ${esc(prio)} |`;
    });
    return ['| ID | Требование | Источник | Приоритет |', '|---|---|---|---|', ...(rows.length ? rows : [`| ${prefix}-NN | <Система> должна <действие> | <BR-…> | <M/S/C/W> |`])].join('\n') + '\n';
  },
  check: (v) => {
    const w: Warning[] = [];
    const prefix = v.prefix?.trim() || 'FR';
    const start = Number.parseInt(v.start || '1', 10) || 1;
    lines(v.items).forEach((l, i) => {
      const id = `${prefix}-${String(start + i).padStart(2, '0')}`;
      const [text = '', src = '', prio = ''] = cells(l);
      if (!/долж/i.test(text)) w.push({ field: 'items', text: `${id}: нет «должна» — это требование или описание?` });
      if (!src) w.push({ field: 'items', text: `${id}: не указан источник (BR, стейкхолдер, документ)` });
      if (prio && !/^[MSCW]$/i.test(prio)) w.push({ field: 'items', text: `${id}: приоритет «${prio}» — не MoSCoW (M, S, C, W)` });
      if (!prio) w.push({ field: 'items', text: `${id}: не указан приоритет` });
      if ((text.match(/,?\s(и|а также)\s/g) ?? []).length >= 2) w.push({ field: 'items', text: `${id}: возможно, составное требование — разделите` });
      findVague(text).forEach((x) => w.push({ field: 'items', text: `${id}: «${x.word}» — ${x.hint}` }));
    });
    if (!lines(v.items).length) w.push({ field: 'items', text: 'Добавьте хотя бы одно требование' });
    return w;
  },
  filename: () => 'functional-requirements.md',
  example: {
    prefix: 'FR',
    start: '6',
    items: [
      'IdM должна генерировать уникальный логин по правилу из раздела 2.1. | BR-02 | M',
      'IdM должна создавать учётные записи за 3 рабочих дня до даты выхода в заблокированном состоянии; если до выхода меньше 3 рабочих дней — сразу. | BR-04 | M',
      'IdM должна активировать учётные записи в 07:00 по часовому поясу подразделения в дату выхода. | BR-04 | M',
    ].join('\n'),
  },
};

// ---------- НФТ ----------
const nfr: ArtifactTemplate = {
  id: 'nfr',
  label: 'НФТ',
  description: 'Нефункциональные требования с метрикой и способом проверки',
  page: '/architecture/nfr-iso25010/',
  fields: [
    { id: 'start', label: 'Первый номер', type: 'text', placeholder: '1', half: true },
    {
      id: 'items',
      label: 'НФТ — «категория | требование | как проверяем | источник» в строке',
      type: 'lines',
      hint: 'Категория — характеристика ISO/IEC 25010: производительность, надёжность, безопасность, удобство использования…',
      placeholder: 'Производительность | 95% событий обрабатываются не дольше 5 минут | Нагрузочный тест | G-01',
    },
  ],
  render: (v) => {
    const start = Number.parseInt(v.start || '1', 10) || 1;
    const rows = lines(v.items).map((l, i) => {
      const [cat = '', req = '', how = '', src = ''] = cells(l);
      return `| NFR-${String(start + i).padStart(2, '0')} | ${esc(cat)} | ${esc(req)} | ${esc(how)} | ${esc(src)} |`;
    });
    return (
      [
        '| ID | Категория | Требование | Как проверяем | Источник |',
        '|---|---|---|---|---|',
        ...(rows.length ? rows : ['| NFR-NN | <характеристика> | <метрика> не хуже <значение> при <условиях> | <тест / мониторинг / ревью> | <цель, стандарт> |']),
      ].join('\n') + '\n'
    );
  },
  check: (v) => {
    const w: Warning[] = [];
    const start = Number.parseInt(v.start || '1', 10) || 1;
    lines(v.items).forEach((l, i) => {
      const id = `NFR-${String(start + i).padStart(2, '0')}`;
      const [cat = '', req = '', how = '', src = ''] = cells(l);
      if (!cat) w.push({ field: 'items', text: `${id}: нет категории` });
      if (!/\d/.test(req)) w.push({ field: 'items', text: `${id}: в требовании нет числа — как его измерить?` });
      if (!how) w.push({ field: 'items', text: `${id}: не указано, как проверяем` });
      if (!src) w.push({ field: 'items', text: `${id}: не указан источник` });
      findVague(req).forEach((x) => w.push({ field: 'items', text: `${id}: «${x.word}» — ${x.hint}` }));
    });
    if (!lines(v.items).length) w.push({ field: 'items', text: 'Добавьте хотя бы одно требование' });
    return w;
  },
  filename: () => 'non-functional-requirements.md',
  example: {
    start: '1',
    items: [
      'Производительность | 95% кадровых событий обрабатываются (от получения до формирования задач провижининга) не дольше 5 минут | Нагрузочный тест, метрика `event_processing_seconds` | G-01',
      'Надёжность | Доступность IdM — 99,5% круглосуточно; RTO — 4 часа, RPO — 15 минут | Мониторинг, учения DR | Стандарт ИТ банка',
      'Надёжность | Доставка кадровых событий — не менее одного раза (at-least-once); дубли обрабатываются идемпотентно (FR-03) | Тест с повторной доставкой (TC-02) | ADR-001',
    ].join('\n'),
  },
};

// ---------- ADR ----------
const adr: ArtifactTemplate = {
  id: 'adr',
  label: 'ADR',
  description: 'Запись архитектурного решения: контекст, варианты, решение, последствия',
  page: '/architecture/adr/',
  fields: [
    { id: 'num', label: 'Номер', type: 'text', placeholder: '002', half: true },
    { id: 'title', label: 'Короткое название решения', type: 'text', placeholder: 'Момент создания учётных записей', half: true },
    { id: 'status', label: 'Статус', type: 'select', options: ['Предложено', 'Принято', 'Устарело', 'Заменено'], half: true },
    { id: 'date', label: 'Дата', type: 'text', placeholder: 'ДД.ММ.ГГГГ', half: true },
    { id: 'people', label: 'Участники', type: 'text', placeholder: 'архитектор, СА, ИБ' },
    { id: 'context', label: 'Контекст — что требуется и почему возник вопрос', type: 'textarea' },
    { id: 'variants', label: 'Варианты — «A. Название | плюсы | минусы» в строке', type: 'lines' },
    { id: 'decision', label: 'Решение — какой вариант и почему', type: 'textarea' },
    { id: 'consequences', label: 'Последствия — новые требования, компоненты, риски', type: 'textarea' },
  ],
  render: (v) => {
    const vars = lines(v.variants).map((l) => {
      const [name = '', plus = '', minus = ''] = cells(l);
      return `| ${esc(name)} | ${esc(plus)} | ${esc(minus)} |`;
    });
    return (
      [
        `## ADR-${or(v.num, 'NNN')}. ${or(v.title, 'Короткое название решения')}`,
        '',
        `**Статус:** ${v.status || 'Предложено'}  `,
        `**Дата:** ${or(v.date, 'ДД.ММ.ГГГГ')} · **Участники:** ${or(v.people, 'архитектор, СА, ИБ')}`,
        '',
        `**Контекст.** ${or(v.context, 'Что требуется и почему вопрос возник')}`,
        '',
        '**Варианты.**',
        '',
        '| Вариант | Плюсы | Минусы |',
        '|---|---|---|',
        ...(vars.length ? vars : ['| A. … | … | … |', '| B. … | … | … |']),
        '',
        `**Решение.** ${or(v.decision, 'Выбираем вариант … потому что …')}`,
        '',
        `**Последствия.** ${or(v.consequences, 'Новые требования, компоненты, статусы, риски')}`,
      ].join('\n') + '\n'
    );
  },
  check: (v) => {
    const w = required(v, [
      ['title', 'название'],
      ['context', 'контекст'],
      ['decision', 'решение'],
      ['consequences', 'последствия — у любого решения есть цена'],
    ]);
    const vars = lines(v.variants);
    if (vars.length < 2) w.push({ field: 'variants', text: 'Меньше двух вариантов — решение без альтернатив не обосновано' });
    vars.forEach((l) => {
      const [name = '', plus = '', minus = ''] = cells(l);
      if (!plus || !minus) w.push({ field: 'variants', text: `«${name}»: укажите и плюсы, и минусы` });
    });
    if (v.decision?.trim() && !/потому|так как|поскольку|чтобы|достаточно/i.test(v.decision)) w.push({ field: 'decision', text: 'В решении не видно обоснования («потому что…»)' });
    return w;
  },
  filename: (v) => `adr-${slug(v.num || 'nnn')}-${slug(v.title)}.md`,
  example: {
    num: '002',
    title: 'Момент создания учётных записей',
    status: 'Принято',
    date: '',
    people: 'архитектор, СА, ИБ',
    context:
      'Доступы должны быть готовы к 09:00 первого дня (BR-04), но не активны до него. Часть систем (АБС, СЭД) может обрабатывать запрос часами или требовать ручного шага.',
    variants:
      'A. Создавать в день выхода | Нет заблокированных учётных записей до выхода, проще модель статусов | Не успеть к 09:00, если система отвечает часами или нужен ручной шаг\nB. Создавать заранее в заблокированном состоянии и активировать утром | Есть время закрыть ручную задачу СЭД и разобрать сбои | Нужны статус CREATED_DISABLED, плановая активация и удаление при отмене приёма',
    decision: 'Вариант B, за 3 рабочих дня (BRL-01). Этого достаточно, чтобы закрыть ручную задачу СЭД и разобрать сбои.',
    consequences:
      'Появляются статус CREATED_DISABLED и плановая активация; при отмене приёма нужно удалять созданные учётные записи (FR-18); активация должна учитывать часовой пояс (FR-08).',
  },
};

// ---------- Интеграция ----------
const integration: ArtifactTemplate = {
  id: 'integration',
  label: 'Описание интеграции',
  description: 'Параметры обмена, ошибки и надёжность, НФТ, мониторинг',
  page: '/documentation/templates/',
  fields: [
    { id: 'id', label: 'ID', type: 'text', placeholder: 'INT-05', half: true },
    { id: 'what', label: 'Что передаётся', type: 'text', placeholder: 'пользователи АБС, статус, роли', half: true },
    { id: 'source', label: 'Источник', type: 'text', half: true },
    { id: 'target', label: 'Приёмник', type: 'text', half: true },
    { id: 'owners', label: 'Владельцы', type: 'text', placeholder: 'команда источника / команда приёмника' },
    { id: 'purpose', label: 'Назначение и сценарии', type: 'textarea' },
    { id: 'protocol', label: 'Протокол / формат', type: 'text', half: true },
    { id: 'mode', label: 'Режим', type: 'text', placeholder: 'синхронно / асинхронно; push / pull', half: true },
    { id: 'volume', label: 'Частота и объём', type: 'text', half: true },
    { id: 'contract', label: 'Контракт', type: 'text', placeholder: 'OpenAPI / AsyncAPI, версия', half: true },
    { id: 'auth', label: 'Аутентификация', type: 'text', placeholder: 'mTLS, OAuth 2.0 …' },
    { id: 'mapping', label: 'Маппинг данных — ссылка или описание', type: 'textarea' },
    { id: 'errors', label: 'Ошибки — «ситуация | код | повтор | что дальше | кто разбирает» в строке', type: 'lines' },
    { id: 'idempotency', label: 'Идемпотентность — ключ', type: 'text', half: true },
    { id: 'dlq', label: 'DLQ / очередь ошибок', type: 'text', half: true },
    { id: 'recon', label: 'Сверка', type: 'text', half: true },
    { id: 'nfr', label: 'НФТ: время ответа, доступность, лимиты', type: 'text', half: true },
    { id: 'monitoring', label: 'Мониторинг и алерты', type: 'textarea' },
    { id: 'questions', label: 'Открытые вопросы — по одному в строке', type: 'lines' },
  ],
  render: (v) => {
    const row = (k: string, val: string | undefined, ph: string) => `| ${k} | ${esc(or(val, ph))} |`;
    const errs = lines(v.errors).map((l) => {
      const c = cells(l);
      return `| ${[0, 1, 2, 3, 4].map((i) => esc(c[i] ?? '')).join(' | ')} |`;
    });
    const parts = [
      `# ${or(v.id, 'INT-NN')}. ${or(v.source, 'Источник')} → ${or(v.target, 'Приёмник')}: ${or(v.what, 'что передаётся')}`,
      '',
      `Владельцы: ${or(v.owners, 'команда источника / команда приёмника')}`,
      '',
      '## 1. Назначение и сценарии',
      '',
      or(v.purpose, 'Зачем интеграция, ссылки на use cases и sequence-диаграммы'),
      '',
      '## 2. Параметры обмена',
      '',
      '| Параметр | Значение |',
      '|---|---|',
      row('Протокол / формат', v.protocol, 'REST, JSON / Kafka, JSON / …'),
      row('Режим', v.mode, 'синхронно / асинхронно; push / pull'),
      row('Частота и объём', v.volume, 'в день, пики, рост'),
      row('Контракт', v.contract, 'ссылка на OpenAPI / AsyncAPI, версия'),
      row('Аутентификация', v.auth, 'mTLS, OAuth 2.0, …'),
      '',
      '## 3. Маппинг данных',
      '',
      or(v.mapping, 'Ссылка или таблица источник → приёмник'),
      '',
      '## 4. Ошибки и надёжность',
      '',
      '| Ситуация | Код / признак | Повтор | Что дальше | Кто разбирает |',
      '|---|---|---|---|---|',
      ...(errs.length ? errs : ['| <ситуация> | <код> | <да / нет, сколько> | <действие> | <кто> |']),
      '',
      `Идемпотентность: ${or(v.idempotency, 'ключ')} · DLQ: ${or(v.dlq, 'где')} · Сверка: ${or(v.recon, 'как часто')}`,
      '',
      '## 5. НФТ',
      '',
      or(v.nfr, 'Время ответа, доступность, лимиты'),
      '',
      '## 6. Мониторинг и алерты',
      '',
      or(v.monitoring, 'Метрики, пороги, кому алерт'),
    ];
    if (lines(v.questions).length) parts.push('', '## 7. Открытые вопросы', '', ...lines(v.questions).map((q) => `- ${q}`));
    return parts.join('\n') + '\n';
  },
  check: (v) => {
    const w = required(v, [
      ['source', 'источник'],
      ['target', 'приёмник'],
      ['protocol', 'протокол'],
      ['mode', 'режим'],
      ['auth', 'аутентификация'],
    ]);
    if (!lines(v.errors).length) w.push({ field: 'errors', text: 'Нет таблицы ошибок — что будет при недоступности и неверных данных?' });
    if (!v.idempotency?.trim()) w.push({ field: 'idempotency', text: 'Не указан ключ идемпотентности — повтор может создать дубль' });
    if (/асинхр|kafka|rabbit|очеред/i.test(`${v.mode} ${v.protocol}`) && !v.dlq?.trim()) w.push({ field: 'dlq', text: 'Асинхронная интеграция без DLQ — куда пойдут некорректные сообщения?' });
    if (!v.monitoring?.trim()) w.push({ field: 'monitoring', text: 'Нет мониторинга — о сбое узнают пользователи' });
    return w;
  },
  filename: (v) => `${slug(v.id || 'int')}-${slug(`${v.source}-${v.target}`)}.md`,
  example: {
    id: 'INT-05',
    what: 'пользователи АБС, статус, роли',
    source: 'IdM',
    target: 'Адаптер АБС',
    owners: 'команда IdM / команда АБС',
    purpose: 'Создание, блокировка, активация пользователей АБС и выдача ролей по задачам провижининга (UC-01, FR-15). Сценарий сбоя — SEQ-02.',
    protocol: 'REST, JSON',
    mode: 'Синхронно, идемпотентно',
    volume: 'По задачам провижининга',
    contract: '`api/abs-adapter.openapi.yaml`',
    auth: 'mTLS',
    mapping: 'Раздел «Маппинг данных» кейса: логин АБС = логин AD в верхнем регистре, код филиала — `abs_branch_code` подразделения.',
    errors:
      'Тайм-аут, 5xx, 429 | технические | Да: всего 3 попытки (через 1 и 5 минут) | Задача в ServiceDesk группе администраторов АБС | Администраторы АБС\nНеверные данные, нет подразделения в справочнике АБС | 4xx (кроме 429) | Нет | Сразу задача в ServiceDesk с текстом ошибки | Администраторы АБС',
    idempotency: '`Idempotency-Key` = `provisioningTaskId`',
    dlq: 'Не применяется (синхронный вызов); неуспешные задачи — статус MANUAL',
    recon: 'В кейсе не описана — открытый вопрос',
    nfr: 'Доступность IdM — 99,5% (NFR-04)',
    monitoring: 'По NFR-11: длина очередей, задержка обработки, доля ошибок коннектора АБС; алерт при ошибках коннектора > 5% за час.',
    questions: 'Нужна ли периодическая сверка учётных записей IdM и АБС и кто разбирает расхождения?',
  },
};

export const ARTIFACT_TEMPLATES: ArtifactTemplate[] = [story, usecase, fr, nfr, adr, integration];
