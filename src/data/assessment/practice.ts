/**
 * Практика аттестации: задания на инструментах справочника с автоматической проверкой.
 * SQL — учебная БД кейса IDM-JOINER (src/data/case-db.sql); HTTP — учебный сервер API Lab (api.lab.local);
 * JSON Schema и OpenAPI — проверка структуры. Эталоны прогоняет scripts/check-assessment.mjs.
 */
import { getHeader } from '../../lib/api-lab/http';
import type { Exchange } from '../../lib/api-lab/mock';
import type { Item } from './types';

type Draft = Omit<Item, 'kind' | 'weight'> & { weight?: number };
const p = (d: Draft): Item => ({ kind: 'practice', weight: 3, ...d }) as Item;

const H = 'https://api.lab.local';
const json = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};
const resJson = (e: Exchange) => json(e.res.body);
const reqJson = (e: Exchange) => json(e.req.body);
const is = (e: Exchange, route: string, status: number) => e.route === route && e.res.status === status;
const key = (e: Exchange) => getHeader(e.req.headers, 'Idempotency-Key') ?? '';
const TOKEN = (client = 'lab-client', secret = 'lab-secret') =>
  `curl -X POST ${H}/auth/token -H "Content-Type: application/x-www-form-urlencoded" -d "grant_type=client_credentials&client_id=${client}&client_secret=${secret}"`;

/** Ссылка на любой объект OpenAPI через $ref. */
const deref = (doc: any, o: any): any => {
  if (o && typeof o.$ref === 'string' && o.$ref.startsWith('#/')) return o.$ref.slice(2).split('/').reduce((x: any, k: string) => x?.[k], doc);
  return o;
};

export const PRACTICE: Item[] = [
  // ---------- SQL (Foundation) ----------
  p({
    id: 'f-sql-attention',
    type: 'sql',
    exams: ['foundation'],
    competency: 'data',
    difficulty: 2,
    weight: 2,
    db: 'idm',
    prompt:
      'Сопровождению нужен список задач провижининга, которые требуют внимания: статус `MANUAL` или `RETRY_WAIT`. Выведите **фамилию сотрудника, код системы, операцию, статус задачи и число попыток**, отсортировав по фамилии.\n\nТаблицы: `provisioning_task` → `account` → `identity`.',
    solution:
      "SELECT i.last_name, a.system_code, t.operation, t.status, t.attempts\nFROM provisioning_task t\nJOIN account a ON a.account_id = t.account_id\nJOIN identity i ON i.identity_id = a.identity_id\nWHERE t.status IN ('MANUAL', 'RETRY_WAIT')\nORDER BY i.last_name;",
    ordered: true,
    explanation: 'Два соединения по внешним ключам и фильтр по статусу. Частая ошибка — выводить `account.status` вместо статуса задачи или забыть одно из соединений и получить декартово произведение.',
    refs: ['data/sql-joins-aggregates', 'data/sql-select'],
  }),
  p({
    id: 'f-sql-org-active',
    type: 'sql',
    exams: ['foundation'],
    competency: 'data',
    difficulty: 2,
    weight: 2,
    db: 'idm',
    prompt:
      'Для каждого подразделения выведите **код, название и число действующих трудоустройств** (`employment.status = \'ACTIVE\'`). Подразделения, где действующих нет, тоже должны быть в списке — с нулём.',
    solution:
      "SELECT o.org_unit_code, o.name, COUNT(e.employment_id) AS active_cnt\nFROM org_unit o\nLEFT JOIN employment e ON e.org_unit_code = o.org_unit_code AND e.status = 'ACTIVE'\nGROUP BY o.org_unit_code, o.name;",
    ordered: false,
    explanation: 'Нужен LEFT JOIN, а условие на статус — в ON: в WHERE оно отбросило бы подразделения без действующих сотрудников. COUNT по столбцу правой таблицы даёт 0 для пустых групп, COUNT(*) дал бы 1.',
    refs: ['data/sql-joins-aggregates'],
  }),
  p({
    id: 'f-sql-multi-employment',
    type: 'sql',
    exams: ['foundation'],
    competency: 'data',
    difficulty: 2,
    weight: 2,
    db: 'idm',
    prompt:
      'Найдите людей (`identity`), у которых **больше одного трудоустройства** (`employment`) — например, внутреннее совместительство. Выведите `person_id`, фамилию и число трудоустройств.',
    solution:
      'SELECT i.person_id, i.last_name, COUNT(*) AS cnt\nFROM identity i\nJOIN employment e ON e.identity_id = i.identity_id\nGROUP BY i.identity_id, i.person_id, i.last_name\nHAVING COUNT(*) > 1;',
    ordered: false,
    explanation: 'Условие на результат агрегата — в HAVING, а не в WHERE. Группировать надёжнее по ключу (identity_id), а не только по фамилии: однофамильцы склеились бы.',
    refs: ['data/sql-joins-aggregates'],
  }),

  // ---------- SQL (Final) ----------
  p({
    id: 'fin-sql-last-task',
    type: 'sql',
    exams: ['final'],
    competency: 'data',
    difficulty: 3,
    weight: 3,
    db: 'idm',
    prompt:
      'Для разбора инцидента нужна **последняя по времени** (`scheduled_at`) задача провижининга по каждой системе. Выведите код системы, операцию, статус и время задачи — по одной строке на систему.',
    solution:
      'SELECT system_code, operation, status, scheduled_at\nFROM (\n  SELECT a.system_code, t.operation, t.status, t.scheduled_at,\n         ROW_NUMBER() OVER (PARTITION BY a.system_code ORDER BY t.scheduled_at DESC) AS rn\n  FROM provisioning_task t\n  JOIN account a ON a.account_id = t.account_id\n) x\nWHERE rn = 1;',
    ordered: false,
    explanation: 'Задача «последняя запись в группе» решается оконной функцией ROW_NUMBER() с PARTITION BY или подзапросом с MAX. GROUP BY с MAX(scheduled_at) и неагрегированными столбцами вернёт значения не из той строки.',
    refs: ['data/sql-subqueries-window'],
  }),

  // ---------- HTTP (Foundation) ----------
  p({
    id: 'f-http-create-user',
    type: 'http',
    exams: ['foundation'],
    competency: 'integrations',
    difficulty: 1,
    prompt:
      'Создайте в АБС пользователя для нового сотрудника: логин `SIDOROVA.EV`, фамилия **Сидорова**, имя **Елена**, подразделение — доп. офис «Екатеринбург-Центр». Код филиала узнайте в справочнике филиалов учебного API.\n\nДоступ: клиент `lab-client`, секрет `lab-secret`. Ресурсы — как в API Lab: `POST /auth/token`, `GET /branches`, `POST /users`.',
    start: `curl -X POST ${H}/users`,
    criteria: [
      { label: 'Получен токен доступа (POST /auth/token → 200)', test: (l) => l.some((e) => is(e, 'POST /auth/token', 200)) },
      { label: 'Код филиала взят из справочника (GET /branches → 200)', test: (l) => l.some((e) => is(e, 'GET /branches', 200)) },
      {
        label: 'Пользователь SIDOROVA.EV создан в филиале 066 (POST /users → 201)',
        test: (l) => l.some((e) => is(e, 'POST /users', 201) && resJson(e)?.login === 'SIDOROVA.EV' && resJson(e)?.branchCode === '066'),
      },
      {
        label: 'Фамилия и имя переданы правильно',
        test: (l) => l.some((e) => is(e, 'POST /users', 201) && resJson(e)?.lastName === 'Сидорова' && resJson(e)?.firstName === 'Елена'),
      },
    ],
    reference: [
      TOKEN(),
      `curl ${H}/branches -H "Authorization: Bearer {{token}}"`,
      `curl -X POST ${H}/users -H "Authorization: Bearer {{token}}" -H "Content-Type: application/json" -d '{"login":"SIDOROVA.EV","lastName":"Сидорова","firstName":"Елена","branchCode":"066"}'`,
    ],
    explanation:
      'Цепочка: токен по client credentials (тело — форма, не JSON) → справочник филиалов → создание с `Authorization: Bearer` и `Content-Type: application/json`. Код филиала нельзя угадывать: при неверном коде сервер отвечает 422.',
    refs: ['tools/api-lab', 'integrations/rest', 'security/oauth'],
  }),
  p({
    id: 'f-http-idempotent-order',
    type: 'http',
    exams: ['foundation'],
    competency: 'integrations',
    difficulty: 2,
    prompt:
      'Создайте заказ клиента `C-77` на 2 штуки товара `SKU-1` так, чтобы **повтор запроса после тайм-аута не создал второй заказ**. Отправьте запрос, а затем **повторите его ещё раз** — как будто ответ не дошёл.\n\nТело заказа: `{"customerId": "C-77", "items": [{"sku": "SKU-1", "quantity": 2}]}`. Доступ: `lab-client` / `lab-secret`. Если что-то пошло не так, нажмите «Сбросить сервер» и начните заново.',
    start: `curl -X POST ${H}/orders`,
    criteria: [
      { label: 'Заказ создан (POST /orders → 201)', test: (l) => l.some((e) => is(e, 'POST /orders', 201)) },
      {
        label: 'Запрос повторён с тем же ключом Idempotency-Key',
        test: (l) => {
          const keys = l.filter((e) => is(e, 'POST /orders', 201) && key(e)).map(key);
          return keys.some((k, i) => keys.indexOf(k) !== i);
        },
      },
      { label: 'Сервер узнал повтор (Idempotent-Replayed: true)', test: (l) => l.some((e) => is(e, 'POST /orders', 201) && getHeader(e.res.headers, 'Idempotent-Replayed') === 'true') },
      {
        label: 'Создан ровно один заказ',
        test: (l) => {
          const ids = new Set(l.filter((e) => is(e, 'POST /orders', 201)).map((e) => resJson(e)?.orderId));
          return ids.size === 1;
        },
      },
    ],
    reference: [
      TOKEN(),
      `curl -X POST ${H}/orders -H "Authorization: Bearer {{token}}" -H "Content-Type: application/json" -H "Idempotency-Key: order-c77-1" -d '{"customerId":"C-77","items":[{"sku":"SKU-1","quantity":2}]}'`,
      `curl -X POST ${H}/orders -H "Authorization: Bearer {{token}}" -H "Content-Type: application/json" -H "Idempotency-Key: order-c77-1" -d '{"customerId":"C-77","items":[{"sku":"SKU-1","quantity":2}]}'`,
    ],
    explanation:
      'Ключ идемпотентности генерирует клиент — один на бизнес-операцию, и повтор отправляется с **тем же** ключом и телом. Сервер сохраняет ответ и на повтор возвращает его, не создавая новую запись. Новый ключ на повторе — это уже новая операция и второй заказ.',
    refs: ['integrations/rest-design', 'integrations/reliability', 'tools/api-lab'],
  }),
  p({
    id: 'f-http-fix-filter',
    type: 'http',
    exams: ['foundation'],
    competency: 'integrations',
    difficulty: 1,
    prompt:
      'Нужно одним запросом получить **не больше двух** сотрудников отдела `retail`. Стартовый запрос возвращает ошибку. Исправьте его и получите нужный список.\n\nДоступ: `lab-client` / `lab-secret`. Параметры ресурса `GET /employees` — на вкладке «Учебный API» в API Lab: `department`, `limit` (от 1 до 100).',
    start: `curl "${H}/employees?dept=retail&limit=200" -H "Authorization: Bearer <токен>"`,
    criteria: [
      { label: 'Сервер ответил 200 на GET /employees', test: (l) => l.some((e) => is(e, 'GET /employees', 200)) },
      {
        label: 'В ответе ровно два сотрудника, и все из retail',
        test: (l) => l.some((e) => is(e, 'GET /employees', 200) && Array.isArray(resJson(e)) && resJson(e).length === 2 && resJson(e).every((x: any) => x.department === 'retail')),
      },
      {
        label: 'Фильтр выполнен сервером (параметры department и limit в запросе)',
        test: (l) => l.some((e) => is(e, 'GET /employees', 200) && /[?&]department=retail/.test(e.req.url) && /[?&]limit=2(&|$)/.test(e.req.url)),
      },
    ],
    reference: [TOKEN(), `curl "${H}/employees?department=retail&limit=2" -H "Authorization: Bearer {{token}}"`],
    explanation:
      'Две ошибки: неизвестный параметр `dept` сервер игнорирует (фильтра нет), а `limit=200` выходит за допустимый диапазон — ответ 400 с указанием поля. Фильтровать нужно на сервере, а не забирать всё и отбирать у себя.',
    refs: ['integrations/rest-design', 'tools/api-lab'],
  }),

  // ---------- HTTP (Final) ----------
  p({
    id: 'fin-http-payment',
    type: 'http',
    exams: ['final'],
    competency: 'integrations',
    difficulty: 3,
    weight: 4,
    prompt:
      'Оплатите заказ: создайте заказ клиента `C-501` (1 шт. `SKU-9`) и платёж на **1500** по нему. Требования к платежу: повтор после тайм-аута **не должен** создать второй платёж — проверьте это, отправив платёж дважды.\n\nДоступ: заказы создаёт клиент `lab-client` / `lab-secret`, платежи — `payments-client` / `payments-secret`. Учитывайте ограничение частоты платежей.',
    start: `curl -X POST ${H}/payments`,
    criteria: [
      { label: 'Заказ создан (POST /orders → 201)', test: (l) => l.some((e) => is(e, 'POST /orders', 201)) },
      { label: 'Платёж по этому заказу на 1500 создан (POST /payments → 201)', test: (l) => l.some((e) => is(e, 'POST /payments', 201) && Number(resJson(e)?.amount) === 1500) },
      {
        label: 'Платёж повторён с тем же Idempotency-Key',
        test: (l) => {
          const keys = l.filter((e) => is(e, 'POST /payments', 201) && key(e)).map(key);
          return keys.some((k, i) => keys.indexOf(k) !== i);
        },
      },
      { label: 'Создан ровно один платёж', test: (l) => new Set(l.filter((e) => is(e, 'POST /payments', 201)).map((e) => resJson(e)?.paymentId)).size === 1 },
    ],
    reference: [
      TOKEN(),
      TOKEN('payments-client', 'payments-secret'),
      `curl -X POST ${H}/orders -H "Authorization: Bearer {{token}}" -H "Content-Type: application/json" -d '{"customerId":"C-501","items":[{"sku":"SKU-9","quantity":1}]}'`,
      `curl -X POST ${H}/payments -H "Authorization: Bearer {{payToken}}" -H "Content-Type: application/json" -H "Idempotency-Key: pay-c501-1" -d '{"orderId":"{{orderId}}","amount":1500}'`,
      `curl -X POST ${H}/payments -H "Authorization: Bearer {{payToken}}" -H "Content-Type: application/json" -H "Idempotency-Key: pay-c501-1" -d '{"orderId":"{{orderId}}","amount":1500}'`,
    ],
    explanation:
      'Нужны два токена: у `lab-client` нет права `payments:write` (иначе 403), у `payments-client` — права на заказы. Платёж ссылается на существующий заказ (иначе 422). Повтор — с тем же ключом и телом; при превышении лимита частоты (429) повторять не раньше `Retry-After`.',
    refs: ['integrations/reliability', 'security/access-control', 'tools/api-lab'],
  }),
  p({
    id: 'fin-http-etag',
    type: 'http',
    exams: ['final'],
    competency: 'integrations',
    difficulty: 3,
    weight: 3,
    prompt:
      'Смените телефон сотрудника `E-1002` на `+7 900 000-99-99` так, чтобы **не затереть чужие изменения**, сделанные между чтением и записью. Изменять нужно только телефон.\n\nДоступ: `lab-client` / `lab-secret`.',
    start: `curl -X PATCH ${H}/employees/E-1002`,
    criteria: [
      { label: 'Запись прочитана (GET /employees/{id} → 200)', test: (l) => l.some((e) => is(e, 'GET /employees/{id}', 200) && /E-1002/.test(e.req.url)) },
      { label: 'Изменение — условным запросом (If-Match) и успешно (PATCH → 200)', test: (l) => l.some((e) => is(e, 'PATCH /employees/{id}', 200) && !!getHeader(e.req.headers, 'If-Match')) },
      {
        label: 'В теле запроса только телефон',
        test: (l) => l.some((e) => is(e, 'PATCH /employees/{id}', 200) && JSON.stringify(Object.keys(reqJson(e) ?? {})) === '["phone"]'),
      },
      { label: 'Телефон стал +7 900 000-99-99', test: (l) => l.some((e) => is(e, 'PATCH /employees/{id}', 200) && resJson(e)?.phone === '+7 900 000-99-99') },
    ],
    reference: [
      TOKEN(),
      `curl ${H}/employees/E-1002 -H "Authorization: Bearer {{token}}"`,
      `curl -X PATCH ${H}/employees/E-1002 -H "Authorization: Bearer {{token}}" -H "Content-Type: application/merge-patch+json" -H 'If-Match: {{etag}}' -d '{"phone":"+7 900 000-99-99"}'`,
    ],
    explanation:
      'Оптимистическая блокировка: читаем запись и её версию (ETag), изменяем с `If-Match`. Если запись успели изменить, сервер ответит 412 — нужно перечитать и повторить, а не перезаписать вслепую. PATCH передаёт только изменяемое поле.',
    refs: ['integrations/rest-design', 'data/transactions-acid'],
  }),

  // ---------- JSON Schema ----------
  p({
    id: 'f-json-visitor',
    type: 'json-schema',
    exams: ['foundation'],
    competency: 'integrations',
    difficulty: 2,
    mode: 'schema',
    prompt:
      'Опишите JSON Schema для заявки на гостевой пропуск. Требования:\n\n- `visitorName` — строка от 2 до 100 символов, обязательно;\n- `visitDate` — дата в формате `YYYY-MM-DD` (`format: date`), обязательно;\n- `hostEmployeeId` — строка вида `E-` и 4 цифры, обязательно;\n- `purpose` — одно из `MEETING`, `INTERVIEW`, `DELIVERY`, обязательно;\n- `carPlate` — строка, необязательно;\n- других полей быть не должно.\n\nПроверка прогонит схему на наборе корректных и некорректных заявок.',
    start: '{\n  "type": "object",\n  "properties": {\n    "visitorName": { "type": "string" }\n  }\n}',
    valid: [
      { visitorName: 'Анна Ли', visitDate: '2027-05-14', hostEmployeeId: 'E-1002', purpose: 'MEETING' },
      { visitorName: 'Курьер ООО «Север»', visitDate: '2027-06-01', hostEmployeeId: 'E-0001', purpose: 'DELIVERY', carPlate: 'А123ВС77' },
    ],
    invalid: [
      { visitorName: 'Анна Ли', hostEmployeeId: 'E-1002', purpose: 'MEETING' },
      { visitorName: 'Анна Ли', visitDate: '14.05.2027', hostEmployeeId: 'E-1002', purpose: 'MEETING' },
      { visitorName: 'Анна Ли', visitDate: '2027-05-14', hostEmployeeId: '1002', purpose: 'MEETING' },
      { visitorName: 'Анна Ли', visitDate: '2027-05-14', hostEmployeeId: 'E-1002', purpose: 'PARTY' },
      { visitorName: 'Анна Ли', visitDate: '2027-05-14', hostEmployeeId: 'E-1002', purpose: 'MEETING', badgeColor: 'red' },
      { visitorName: 'А', visitDate: '2027-05-14', hostEmployeeId: 'E-1002', purpose: 'MEETING' },
    ],
    reference:
      '{\n  "type": "object",\n  "required": ["visitorName", "visitDate", "hostEmployeeId", "purpose"],\n  "additionalProperties": false,\n  "properties": {\n    "visitorName": { "type": "string", "minLength": 2, "maxLength": 100 },\n    "visitDate": { "type": "string", "format": "date" },\n    "hostEmployeeId": { "type": "string", "pattern": "^E-[0-9]{4}$" },\n    "purpose": { "type": "string", "enum": ["MEETING", "INTERVIEW", "DELIVERY"] },\n    "carPlate": { "type": "string" }\n  }\n}',
    explanation:
      'Обязательность — в `required` на уровне объекта, а не у поля. Шаблон — с якорями `^…$`, иначе подойдёт любая строка, содержащая совпадение. `additionalProperties: false` запрещает лишние поля. `format: date` проверяет формат даты.',
    refs: ['integrations/formats', 'tools/json-yaml'],
  }),
  p({
    id: 'fin-json-limit-event',
    type: 'json-schema',
    exams: ['final'],
    competency: 'integrations',
    difficulty: 3,
    weight: 3,
    mode: 'schema',
    prompt:
      'Опишите JSON Schema события «лимит карты изменён». Требования:\n\n- `eventId` — UUID (`format: uuid`), `cardId` — строка, `occurredAt` — дата-время (`format: date-time`) — всё обязательно;\n- `limitType` — `DAILY` или `MONTHLY`, обязательно;\n- `amount` — **целое** число копеек от 0 и больше, обязательно;\n- `changeType` — `PERMANENT` или `TEMPORARY`, обязательно;\n- если `changeType = TEMPORARY`, обязательно `expiresAt` (дата-время); для `PERMANENT` поле `expiresAt` не передаётся;\n- допускаются дополнительные поля (потребители — tolerant reader).',
    start: '{\n  "type": "object",\n  "required": ["eventId", "cardId"],\n  "properties": {\n    "eventId": { "type": "string" },\n    "cardId": { "type": "string" }\n  }\n}',
    valid: [
      { eventId: '3f2b6c1e-8d4a-4c55-9a77-2d9e1c0b6a11', cardId: 'C-1', occurredAt: '2027-03-01T10:00:00Z', limitType: 'DAILY', amount: 5000000, changeType: 'PERMANENT' },
      { eventId: '3f2b6c1e-8d4a-4c55-9a77-2d9e1c0b6a12', cardId: 'C-1', occurredAt: '2027-03-01T10:00:00Z', limitType: 'DAILY', amount: 15000000, changeType: 'TEMPORARY', expiresAt: '2027-03-02T10:00:00Z' },
      { eventId: '3f2b6c1e-8d4a-4c55-9a77-2d9e1c0b6a13', cardId: 'C-1', occurredAt: '2027-03-01T10:00:00Z', limitType: 'MONTHLY', amount: 0, changeType: 'PERMANENT', channel: 'MOBILE' },
    ],
    invalid: [
      { eventId: '3f2b6c1e-8d4a-4c55-9a77-2d9e1c0b6a11', cardId: 'C-1', occurredAt: '2027-03-01T10:00:00Z', limitType: 'DAILY', amount: 15000000, changeType: 'TEMPORARY' },
      { eventId: '3f2b6c1e-8d4a-4c55-9a77-2d9e1c0b6a11', cardId: 'C-1', occurredAt: '2027-03-01T10:00:00Z', limitType: 'DAILY', amount: 50000.5, changeType: 'PERMANENT' },
      { eventId: '3f2b6c1e-8d4a-4c55-9a77-2d9e1c0b6a11', cardId: 'C-1', occurredAt: '2027-03-01T10:00:00Z', limitType: 'DAILY', amount: -1, changeType: 'PERMANENT' },
      { eventId: 'abc', cardId: 'C-1', occurredAt: '2027-03-01T10:00:00Z', limitType: 'DAILY', amount: 100, changeType: 'PERMANENT' },
      { eventId: '3f2b6c1e-8d4a-4c55-9a77-2d9e1c0b6a11', cardId: 'C-1', occurredAt: '2027-03-01T10:00:00Z', limitType: 'WEEKLY', amount: 100, changeType: 'PERMANENT' },
      { eventId: '3f2b6c1e-8d4a-4c55-9a77-2d9e1c0b6a11', cardId: 'C-1', occurredAt: '2027-03-01T10:00:00Z', limitType: 'DAILY', amount: 100, changeType: 'PERMANENT', expiresAt: '2027-03-02T10:00:00Z' },
    ],
    reference:
      '{\n  "type": "object",\n  "required": ["eventId", "cardId", "occurredAt", "limitType", "amount", "changeType"],\n  "properties": {\n    "eventId": { "type": "string", "format": "uuid" },\n    "cardId": { "type": "string" },\n    "occurredAt": { "type": "string", "format": "date-time" },\n    "limitType": { "enum": ["DAILY", "MONTHLY"] },\n    "amount": { "type": "integer", "minimum": 0 },\n    "changeType": { "enum": ["PERMANENT", "TEMPORARY"] },\n    "expiresAt": { "type": "string", "format": "date-time" }\n  },\n  "if": { "properties": { "changeType": { "const": "TEMPORARY" } } },\n  "then": { "required": ["expiresAt"] },\n  "else": { "not": { "required": ["expiresAt"] } }\n}',
    explanation:
      'Условная обязательность в JSON Schema — `if` / `then` / `else` (или `oneOf`). Сумма — `integer` с `minimum: 0`: дробные копейки и отрицательные лимиты отсекаются схемой. Дополнительные поля разрешены намеренно, чтобы новые поля события не ломали потребителей.',
    refs: ['integrations/formats', 'release/compatibility'],
  }),

  // ---------- OpenAPI ----------
  p({
    id: 'f-oas-visitors',
    type: 'openapi',
    exams: ['foundation'],
    competency: 'integrations',
    difficulty: 2,
    prompt:
      'Ревью контракта API гостевых пропусков нашло проблемы. Исправьте контракт:\n\n1. Параметр пути `visitorId` должен быть обязательным.\n2. Создание пропуска (`POST /visitors`) должно отвечать **201**, а не 200.\n3. У `POST /visitors` нет ответа на ошибку валидации — добавьте **400** со схемой `Problem`.\n4. У `GET /visitors/{visitorId}` нет ответа **404**.\n5. В схеме `VisitorCreate` поля `visitorName` и `visitDate` должны быть обязательными.\n\nПроверка смотрит на структуру документа: пути, коды ответов, параметры, `required`.',
    start: `openapi: 3.0.3
info:
  title: API гостевых пропусков
  version: 1.0.0
paths:
  /visitors:
    post:
      summary: Создать пропуск
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VisitorCreate'
      responses:
        '200':
          description: Пропуск создан
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Visitor'
  /visitors/{visitorId}:
    get:
      summary: Получить пропуск
      parameters:
        - name: visitorId
          in: path
          schema:
            type: string
      responses:
        '200':
          description: Пропуск
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Visitor'
components:
  schemas:
    VisitorCreate:
      type: object
      properties:
        visitorName:
          type: string
        visitDate:
          type: string
          format: date
    Visitor:
      allOf:
        - $ref: '#/components/schemas/VisitorCreate'
        - type: object
          properties:
            visitorId:
              type: string
    Problem:
      type: object
      required: [type, title, status]
      properties:
        type: { type: string }
        title: { type: string }
        status: { type: integer }
        detail: { type: string }
`,
    checks: [
      {
        label: 'Параметр пути visitorId обязателен',
        test: (d) => (d.paths['/visitors/{visitorId}'].get.parameters ?? d.paths['/visitors/{visitorId}'].parameters).some((x: any) => x.name === 'visitorId' && x.in === 'path' && x.required === true),
      },
      { label: 'POST /visitors отвечает 201', test: (d) => !!d.paths['/visitors'].post.responses['201'] && !d.paths['/visitors'].post.responses['200'] },
      {
        label: 'У POST /visitors есть ответ 400 со схемой Problem',
        test: (d) => {
          const r = deref(d, d.paths['/visitors'].post.responses['400']);
          const c = r?.content?.['application/problem+json'] ?? r?.content?.['application/json'];
          return !!c && (c.schema?.$ref === '#/components/schemas/Problem' || !!deref(d, c.schema)?.required?.includes('status'));
        },
      },
      { label: 'У GET /visitors/{visitorId} есть ответ 404', test: (d) => !!d.paths['/visitors/{visitorId}'].get.responses['404'] },
      { label: 'В VisitorCreate обязательны visitorName и visitDate', test: (d) => ['visitorName', 'visitDate'].every((f) => d.components.schemas.VisitorCreate.required?.includes(f)) },
      { label: 'Документ остался корректным: версия 3.x, info, paths', test: (d) => /^3\./.test(String(d.openapi)) && !!d.info?.title && !!d.paths },
    ],
    reference: `openapi: 3.0.3
info:
  title: API гостевых пропусков
  version: 1.0.0
paths:
  /visitors:
    post:
      summary: Создать пропуск
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/VisitorCreate'
      responses:
        '201':
          description: Пропуск создан
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Visitor'
        '400':
          description: Ошибка валидации
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'
  /visitors/{visitorId}:
    get:
      summary: Получить пропуск
      parameters:
        - name: visitorId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Пропуск
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Visitor'
        '404':
          description: Пропуск не найден
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'
components:
  schemas:
    VisitorCreate:
      type: object
      required: [visitorName, visitDate]
      properties:
        visitorName:
          type: string
        visitDate:
          type: string
          format: date
    Visitor:
      allOf:
        - $ref: '#/components/schemas/VisitorCreate'
        - type: object
          properties:
            visitorId:
              type: string
    Problem:
      type: object
      required: [type, title, status]
      properties:
        type: { type: string }
        title: { type: string }
        status: { type: integer }
        detail: { type: string }
`,
    explanation:
      'Параметр пути в OpenAPI 3 всегда `required: true` — без этого документ невалиден. Создание ресурса — 201 (и обычно `Location`). Ошибки описывают явно, с единым форматом Problem Details. Обязательность полей — в `required` схемы.',
    refs: ['integrations/contracts', 'tools/openapi-viewer', 'integrations/rest-design'],
  }),

  // ---------- Требования (открытый ответ) ----------
  p({
    id: 'f-req-rewrite',
    type: 'text',
    exams: ['foundation'],
    competency: 'requirements',
    difficulty: 2,
    lint: 'requirements',
    prompt:
      'Перепишите требования так, чтобы их можно было однозначно проверить. Каждое требование — с новой строки. Где не хватает данных, предложите конкретное значение и отметьте его как допущение для согласования.\n\n1. «Система должна быстро уведомлять клиента о блокировке карты.»\n2. «Оператор колл-центра должен видеть все необходимые данные клиента.»\n3. «Система должна блокировать подозрительные операции и т. п.»\n\nПосле завершения вы увидите эталон и критерии и оцените свой ответ сами. Линтер требований подсветит размытые слова уже во время работы.',
    placeholder: 'ФТ-1. Система должна …',
    reference:
      'ФТ-1. Система должна отправить клиенту push-уведомление о блокировке карты не позже 10 секунд после смены статуса карты на BLOCKED; если push не доставлен за 60 секунд — SMS на основной номер. (Допущение: 10 и 60 секунд — согласовать с владельцем продукта.)\n\nФТ-2. На экране «Клиент» оператор колл-центра должен видеть: ФИО, маскированный номер карты (последние 4 цифры), статус карты, текущие дневной и месячный лимиты, последние 5 операций. Полный номер карты и CVV оператору не показываются.\n\nФТ-3. Система должна отклонять операцию по карте, если антифрод-сервис вернул оценку риска выше порога 0,8, и создавать задачу на проверку в очереди антифрода. (Перечень остальных правил антифрода — отдельные требования; «и т. п.» убрано.)',
    rubric: [
      '«Быстро» заменено измеримым сроком с точкой отсчёта',
      'Указан канал уведомления и что делать, если он недоступен',
      '«Все необходимые данные» заменены конкретным перечнем полей',
      'Учтена безопасность: что оператору показывать нельзя или только в маскированном виде',
      '«Подозрительная операция» определена через проверяемое условие (оценка, правило)',
      '«И т. п.» убрано: каждое требование конечно и проверяемо',
      'Значения, которых нет в исходных данных, отмечены как допущения для согласования',
    ],
    explanation:
      'Проверяемое требование отвечает на вопросы «что именно, когда, при каком условии, как узнать, что выполнено». Неизвестные значения не выдумывают молча — их предлагают и выносят на согласование.',
    refs: ['requirements/quality', 'tools/requirements-linter'],
  }),
];
