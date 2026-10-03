/**
 * Задания SQL-тренажёра на учебной БД кейса (src/data/case-db.sql, диалект SQLite).
 * Проверка: запрос пользователя и эталон выполняются на свежей копии БД, результаты сравниваются
 * по значениям (имена столбцов не важны); ordered — важен ли порядок строк.
 * Все эталоны прогнаны на case-db.sql (см. scripts/check-sql-tasks.mjs).
 */
export interface SqlTask {
  id: string;
  level: 'база' | 'средний' | 'продвинутый';
  topic: string;
  title: string;
  text: string;
  hint: string;
  solution: string;
  ordered: boolean;
}

export const SQL_TASKS: SqlTask[] = [
  {
    id: 'select-org',
    level: 'база',
    topic: 'SELECT, ORDER BY',
    title: 'Справочник подразделений',
    text: 'Выведите код, название и часовой пояс всех подразделений, отсортировав по коду.',
    hint: 'Таблица org_unit; ORDER BY по org_unit_code.',
    solution: 'SELECT org_unit_code, name, timezone\nFROM org_unit\nORDER BY org_unit_code;',
    ordered: true,
  },
  {
    id: 'where-ad-active',
    level: 'база',
    topic: 'WHERE',
    title: 'Активные учётные записи AD',
    text: 'Выведите логины всех активных (status = ACTIVE) учётных записей в системе AD.',
    hint: 'Два условия через AND: system_code и status.',
    solution: "SELECT login\nFROM account\nWHERE system_code = 'AD' AND status = 'ACTIVE';",
    ordered: false,
  },
  {
    id: 'where-null',
    level: 'база',
    topic: 'NULL',
    title: 'Подразделения без кода АБС',
    text: 'Найдите подразделения, у которых не заполнен код филиала АБС (abs_branch_code). Выведите код и название.',
    hint: 'Сравнение с NULL через «=» всегда ложно — нужен IS NULL.',
    solution: 'SELECT org_unit_code, name\nFROM org_unit\nWHERE abs_branch_code IS NULL;',
    ordered: false,
  },
  {
    id: 'where-no-middle',
    level: 'база',
    topic: 'NULL',
    title: 'Сотрудники без отчества',
    text: 'Выведите фамилию и имя людей, у которых нет отчества. Для них правило логина другое: фамилия.первая буква имени (FR-06).',
    hint: 'identity.middle_name IS NULL.',
    solution: 'SELECT last_name, first_name\nFROM identity\nWHERE middle_name IS NULL;',
    ordered: false,
  },
  {
    id: 'order-limit',
    level: 'база',
    topic: 'ORDER BY, LIMIT',
    title: 'Три последних приёма',
    text: 'Выведите hr_employment_id и дату выхода трёх трудоустройств с самой поздней датой выхода, не считая отменённых (status = CANCELLED). От поздних к ранним.',
    hint: 'WHERE status <> …, ORDER BY hire_date DESC, LIMIT 3.',
    solution: "SELECT hr_employment_id, hire_date\nFROM employment\nWHERE status <> 'CANCELLED'\nORDER BY hire_date DESC\nLIMIT 3;",
    ordered: true,
  },
  {
    id: 'join-position',
    level: 'база',
    topic: 'JOIN',
    title: 'Кто на какой должности',
    text: 'Для каждого трудоустройства выведите фамилию сотрудника, название должности и статус трудоустройства.',
    hint: 'employment → identity по identity_id, employment → position по position_code.',
    solution:
      'SELECT i.last_name, p.name, e.status\nFROM employment e\nJOIN identity i ON i.identity_id = e.identity_id\nJOIN position p ON p.position_code = e.position_code;',
    ordered: false,
  },
  {
    id: 'join-accounts',
    level: 'база',
    topic: 'JOIN',
    title: 'Учётные записи с названием системы',
    text: 'Выведите фамилию, название целевой системы (target_system.name), логин и статус каждой учётной записи.',
    hint: 'account → identity и account → target_system.',
    solution:
      'SELECT i.last_name, s.name, a.login, a.status\nFROM account a\nJOIN identity i ON i.identity_id = a.identity_id\nJOIN target_system s ON s.system_code = a.system_code;',
    ordered: false,
  },
  {
    id: 'left-join-none',
    level: 'средний',
    topic: 'LEFT JOIN',
    title: 'Люди без учётных записей',
    text: 'Найдите людей (identity), у которых нет ни одной учётной записи. Выведите фамилию и статус идентичности.',
    hint: 'LEFT JOIN account и условие «правая сторона не нашлась»: a.account_id IS NULL.',
    solution:
      'SELECT i.last_name, i.status\nFROM identity i\nLEFT JOIN account a ON a.identity_id = i.identity_id\nWHERE a.account_id IS NULL;',
    ordered: false,
  },
  {
    id: 'group-status',
    level: 'средний',
    topic: 'GROUP BY',
    title: 'Учётные записи по статусам',
    text: 'Посчитайте число учётных записей в каждом статусе. Выведите статус и количество.',
    hint: 'GROUP BY status, COUNT(*).',
    solution: 'SELECT status, COUNT(*)\nFROM account\nGROUP BY status;',
    ordered: false,
  },
  {
    id: 'having-org',
    level: 'средний',
    topic: 'GROUP BY, HAVING',
    title: 'Подразделения с несколькими трудоустройствами',
    text: 'Выведите код подразделения и число трудоустройств в нём — только для подразделений, где трудоустройств больше одного (любых статусов).',
    hint: 'Условие на агрегат — в HAVING, а не в WHERE.',
    solution: 'SELECT org_unit_code, COUNT(*)\nFROM employment\nGROUP BY org_unit_code\nHAVING COUNT(*) > 1;',
    ordered: false,
  },
  {
    id: 'role-entitlements',
    level: 'средний',
    topic: 'LEFT JOIN, COUNT',
    title: 'Сколько полномочий в каждой роли',
    text: 'Для каждой бизнес-роли выведите её название и число входящих в неё полномочий. Роли без полномочий тоже должны попасть в результат — с нулём.',
    hint: 'LEFT JOIN role_entitlement и COUNT(поле правой таблицы) — COUNT(*) посчитал бы пустую строку как 1.',
    solution:
      'SELECT r.name, COUNT(re.entitlement_id)\nFROM business_role r\nLEFT JOIN role_entitlement re ON re.role_id = r.role_id\nGROUP BY r.role_id, r.name;',
    ordered: false,
  },
  {
    id: 'case-when',
    level: 'средний',
    topic: 'CASE',
    title: 'Готовность учётных записей',
    text: 'Для каждой учётной записи выведите логин, систему и метку: «готова» для ACTIVE и CREATED_DISABLED, «проблема» для FAILED, «в работе» для остальных статусов.',
    hint: "CASE WHEN status IN (…) THEN 'готова' WHEN … ELSE … END.",
    solution:
      "SELECT login, system_code,\n       CASE WHEN status IN ('ACTIVE', 'CREATED_DISABLED') THEN 'готова'\n            WHEN status = 'FAILED' THEN 'проблема'\n            ELSE 'в работе' END\nFROM account;",
    ordered: false,
  },
  {
    id: 'not-exists',
    level: 'средний',
    topic: 'Подзапросы',
    title: 'Полномочия, которые никто не запрашивал',
    text: 'Выведите идентификатор и название полномочий, которые ни разу не встречаются в позициях заявок (request_item).',
    hint: 'NOT EXISTS (SELECT 1 FROM request_item … WHERE … = e.entitlement_id) или NOT IN.',
    solution:
      'SELECT e.entitlement_id, e.name\nFROM entitlement e\nWHERE NOT EXISTS (\n  SELECT 1 FROM request_item ri WHERE ri.entitlement_id = e.entitlement_id\n);',
    ordered: false,
  },
  {
    id: 'role-chain',
    level: 'продвинутый',
    topic: 'Несколько JOIN',
    title: 'Какие полномочия АБС положены Иванову',
    text: 'По назначенным ролям трудоустройства E-2027-00431 (Иванов) выведите идентификаторы и названия полномочий в системе АБС (system_code = ABS).',
    hint: 'employment → role_assignment → role_entitlement → entitlement; фильтр по hr_employment_id и system_code.',
    solution:
      "SELECT DISTINCT en.entitlement_id, en.name\nFROM employment e\nJOIN role_assignment ra ON ra.employment_id = e.employment_id\nJOIN role_entitlement re ON re.role_id = ra.role_id\nJOIN entitlement en ON en.entitlement_id = re.entitlement_id\nWHERE e.hr_employment_id = 'E-2027-00431'\n  AND en.system_code = 'ABS';",
    ordered: false,
  },
  {
    id: 'critical-items',
    level: 'продвинутый',
    topic: 'Несколько JOIN',
    title: 'Заявки на критичные полномочия',
    text: 'Выведите номер заявки, фамилию сотрудника, для которого запрошен доступ, полномочие и статус позиции — только для критичных полномочий (is_critical = 1).',
    hint: 'request_item → access_request → employment → identity и request_item → entitlement.',
    solution:
      'SELECT r.request_id, i.last_name, en.entitlement_id, ri.status\nFROM request_item ri\nJOIN access_request r ON r.request_id = ri.request_id\nJOIN employment e ON e.employment_id = r.employment_id\nJOIN identity i ON i.identity_id = e.identity_id\nJOIN entitlement en ON en.entitlement_id = ri.entitlement_id\nWHERE en.is_critical = 1;',
    ordered: false,
  },
  {
    id: 'dates',
    level: 'продвинутый',
    topic: 'Даты',
    title: 'Сколько дней до выхода',
    text: 'Для запланированных трудоустройств (status = PLANNED) выведите hr_employment_id, дату выхода и число календарных дней от 2027-03-10 до даты выхода (целым числом).',
    hint: 'В SQLite разница дат — через julianday(): CAST(julianday(hire_date) - julianday(\'2027-03-10\') AS INTEGER). В PostgreSQL было бы hire_date - DATE \'2027-03-10\'.',
    solution:
      "SELECT hr_employment_id, hire_date,\n       CAST(julianday(hire_date) - julianday('2027-03-10') AS INTEGER)\nFROM employment\nWHERE status = 'PLANNED';",
    ordered: false,
  },
  {
    id: 'window-rownum',
    level: 'продвинутый',
    topic: 'Оконные функции',
    title: 'Порядковый номер трудоустройства',
    text: 'Для каждого трудоустройства выведите identity_id, hr_employment_id, дату выхода и порядковый номер трудоустройства у этого человека по дате выхода (1 — самое раннее). Отсортируйте по identity_id и номеру.',
    hint: 'ROW_NUMBER() OVER (PARTITION BY identity_id ORDER BY hire_date).',
    solution:
      'SELECT identity_id, hr_employment_id, hire_date,\n       ROW_NUMBER() OVER (PARTITION BY identity_id ORDER BY hire_date)\nFROM employment\nORDER BY identity_id, 4;',
    ordered: true,
  },
];
