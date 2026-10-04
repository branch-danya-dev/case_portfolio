/**
 * Задания API Lab: стартовый запрос сломан, исправить нужно самому.
 * Проверка — по журналу запросов к учебному серверу (что реально пришло и что ответил сервер), а не по нажатию кнопки.
 * Эталонные решения проверяются тестом scripts/check-api-lab.mjs.
 */
import { getHeader } from './http';
import type { Exchange } from './mock';

export type Mode = 'curl' | 'raw';

export interface LabExercise {
  id: string;
  code: string;
  title: string;
  story: string;
  goal: string;
  mode: Mode;
  start: string;
  hint: string;
  explanation: string;
  /** Эталонные запросы (в формате start.mode) — для теста; в интерфейсе не показываются до решения. */
  solution: string[];
  check: (log: Exchange[]) => boolean;
}

const ok = (ex: Exchange, route: string, status: number) => ex.route === route && ex.res.status === status;
const body = (ex: Exchange) => {
  try {
    return JSON.parse(ex.res.body);
  } catch {
    return null;
  }
};
const reqBody = (ex: Exchange) => {
  try {
    return JSON.parse(ex.req.body);
  } catch {
    return null;
  }
};
const retryAfter = (ex: Exchange) => Number(getHeader(ex.res.headers, 'Retry-After') ?? 0);
const H = 'https://api.lab.local';
/** Подставляется в эталонные решения теста вместо настоящего токена. */
export const TOKEN = '{{token}}';
export const PAY_TOKEN = '{{payToken}}';
export const ORDER = '{{orderId}}';

export const LAB_EXERCISES: LabExercise[] = [
  {
    id: 'token',
    code: '415',
    title: 'Получить токен',
    story: 'Первый шаг почти любой интеграции — получить токен доступа. Запрос ниже возвращает 415. Исправьте его так, чтобы получить access_token.',
    goal: 'Ответ 200 на POST /auth/token',
    mode: 'curl',
    start: `curl -X POST ${H}/auth/token \\\n  -H "Content-Type: application/json" \\\n  -d '{"grant_type":"client_credentials","client_id":"lab-client","client_secret":"lab-secret"}'`,
    hint: 'Прочитайте detail в ответе. Точка выдачи токена OAuth 2.0 принимает параметры формой: grant_type=…&client_id=…&client_secret=…',
    explanation:
      'В OAuth 2.0 (RFC 6749) параметры запроса токена передаются формой application/x-www-form-urlencoded, а не JSON. 415 Unsupported Media Type — сервер не принимает формат тела, указанный в Content-Type. Заметьте: curl с -d сам ставит form-urlencoded, поэтому достаточно убрать заголовок и записать параметры формой.',
    solution: [`curl -X POST ${H}/auth/token -d 'grant_type=client_credentials&client_id=lab-client&client_secret=lab-secret'`],
    check: (log) => log.some((e) => ok(e, 'POST /auth/token', 200)),
  },
  {
    id: 'auth',
    code: '401',
    title: 'Список сотрудников',
    story: 'Запрос списка сотрудников возвращает 401. Почините его. Токен у вас уже есть — из предыдущего задания (или получите новый).',
    goal: 'Ответ 200 на GET /employees',
    mode: 'raw',
    start: 'GET /employees HTTP/1.1\nHost: api.lab.local\nAccept: application/json\n',
    hint: 'Посмотрите заголовок WWW-Authenticate в ответе. Токен передаётся заголовком Authorization: Bearer <access_token>.',
    explanation:
      '401 Unauthorized — сервер не знает, кто вы: нет учётных данных или они недействительны. В ответе 401 есть заголовок WWW-Authenticate — он подсказывает схему (Bearer). Не путать с 403: там клиент известен, но прав не хватает.',
    solution: [`GET /employees HTTP/1.1\nHost: api.lab.local\nAuthorization: Bearer ${TOKEN}\n`],
    check: (log) => log.some((e) => ok(e, 'GET /employees', 200)),
  },
  {
    id: 'content-type',
    code: '415',
    title: 'Создать пользователя через curl',
    story: 'Команда создаёт пользователя АБС, но сервер отвечает 415, хотя тело — правильный JSON. Найдите причину. Подставьте свой токен.',
    goal: 'Ответ 201 на POST /users (пользователь SIDOROVA.AS)',
    mode: 'curl',
    start: `curl -X POST ${H}/users \\\n  -H "Authorization: Bearer <ваш токен>" \\\n  -d '{"login":"SIDOROVA.AS","lastName":"Сидорова","firstName":"Анна","branchCode":"066"}'`,
    hint: 'Посмотрите вкладку «Сырой запрос»: какой Content-Type на самом деле ушёл? Что curl делает с -d без явного заголовка?',
    explanation:
      'curl с -d без явного Content-Type отправляет application/x-www-form-urlencoded — сервер честно отвечает 415. Нужно -H "Content-Type: application/json" или флаг --json. Частая ошибка при воспроизведении дефектов «из curl» — сравнивайте сырой запрос, а не то, что кажется отправленным.',
    solution: [`curl -X POST ${H}/users -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" -d '{"login":"SIDOROVA.AS","lastName":"Сидорова","firstName":"Анна","branchCode":"066"}'`],
    check: (log) => log.some((e) => ok(e, 'POST /users', 201) && reqBody(e)?.login === 'SIDOROVA.AS'),
  },
  {
    id: 'bad-json',
    code: '400',
    title: 'Сломанный JSON',
    story: 'Запрос отвечает 400. Найдите и исправьте ошибку в теле.',
    goal: 'Ответ 201 на POST /users (пользователь KOZLOV.IV)',
    mode: 'raw',
    start: `POST /users HTTP/1.1\nHost: api.lab.local\nAuthorization: Bearer <ваш токен>\nContent-Type: application/json\n\n{\n  "login": "KOZLOV.IV",\n  "lastName": "Козлов",\n  "firstName": "Иван",\n  "branchCode": "025",\n}`,
    hint: 'В detail указано, где разбор JSON споткнулся. Проверьте последнюю строку перед закрывающей скобкой.',
    explanation:
      '400 Bad Request — запрос нельзя разобрать: синтаксис JSON, неверный тип, нет обязательного поля. Здесь — лишняя запятая после последнего поля: в JSON она запрещена. Проверить JSON можно в инструменте «JSON / YAML».',
    solution: [`POST /users HTTP/1.1\nHost: api.lab.local\nAuthorization: Bearer ${TOKEN}\nContent-Type: application/json\n\n{"login": "KOZLOV.IV", "lastName": "Козлов", "firstName": "Иван", "branchCode": "025"}`],
    check: (log) => log.some((e) => ok(e, 'POST /users', 201) && reqBody(e)?.login === 'KOZLOV.IV'),
  },
  {
    id: 'unprocessable',
    code: '422',
    title: 'Неизвестный филиал',
    story: 'JSON корректный, но сервер отвечает 422. Выясните, какое значение допустимо, и создайте пользователя.',
    goal: 'Ответ 201 на POST /users (пользователь MOROZOVA.OP)',
    mode: 'curl',
    start: `curl -X POST ${H}/users \\\n  -H "Authorization: Bearer <ваш токен>" \\\n  --json '{"login":"MOROZOVA.OP","lastName":"Морозова","firstName":"Ольга","branchCode":"999"}'`,
    hint: 'detail подсказывает, где взять список: GET /branches. Выберите филиал «Владивосток».',
    explanation:
      '422 Unprocessable Content — запрос синтаксически верный, но не проходит бизнес-проверку: ссылка на несуществующий справочник. В кейсе IDM-JOINER так адаптер АБС отвечает на неизвестный branchCode, и по политике повторов FR-16 такую ошибку не повторяют — её исправляют данными.',
    solution: [`curl ${H}/branches -H "Authorization: Bearer ${TOKEN}"`, `curl -X POST ${H}/users -H "Authorization: Bearer ${TOKEN}" --json '{"login":"MOROZOVA.OP","lastName":"Морозова","firstName":"Ольга","branchCode":"025"}'`],
    check: (log) => log.some((e) => ok(e, 'POST /users', 201) && reqBody(e)?.login === 'MOROZOVA.OP'),
  },
  {
    id: 'conflict',
    code: '409',
    title: 'Логин занят',
    story: 'Создание пользователя Иванова Андрея Павловича отвечает 409. Посмотрите, кому принадлежит логин, и создайте пользователя по правилу кейса: при совпадении к логину добавляется цифра 2.',
    goal: 'Посмотреть занятого пользователя (GET /users/{login}) и создать IVANOV.AP2',
    mode: 'curl',
    start: `curl -X POST ${H}/users \\\n  -H "Authorization: Bearer <ваш токен>" \\\n  --json '{"login":"IVANOV.AP","lastName":"Иванов","firstName":"Андрей","branchCode":"066"}'`,
    hint: 'GET /users/IVANOV.AP — чей логин? Затем POST с логином IVANOV.AP2.',
    explanation:
      '409 Conflict — запрос противоречит текущему состоянию: уникальный ключ уже занят. Повторять такой запрос бесполезно — нужно решение по данным. В кейсе правило генерации логина (FR-06) добавляет суффикс 2…9 при коллизии.',
    solution: [`curl ${H}/users/IVANOV.AP -H "Authorization: Bearer ${TOKEN}"`, `curl -X POST ${H}/users -H "Authorization: Bearer ${TOKEN}" --json '{"login":"IVANOV.AP2","lastName":"Иванов","firstName":"Андрей","branchCode":"066"}'`],
    check: (log) => log.some((e) => ok(e, 'GET /users/{login}', 200)) && log.some((e) => ok(e, 'POST /users', 201) && reqBody(e)?.login === 'IVANOV.AP2'),
  },
  {
    id: 'idempotency',
    code: 'дубль',
    title: 'Повтор создал два заказа',
    story: 'Клиент не дождался ответа и повторил POST /orders — создалось два одинаковых заказа. Сделайте так, чтобы повтор того же запроса не создавал дубль: отправьте один и тот же заказ дважды и убедитесь, что заказ один.',
    goal: 'Два одинаковых POST /orders с одним Idempotency-Key; второй ответ — повтор первого',
    mode: 'curl',
    start: `curl -X POST ${H}/orders \\\n  -H "Authorization: Bearer <ваш токен>" \\\n  --json '{"customerId":"C-77","items":[{"sku":"CARD-GOLD","quantity":1}]}'`,
    hint: 'Добавьте заголовок Idempotency-Key с уникальным значением (например, order-001) и отправьте запрос дважды. Сравните orderId и заголовок Idempotent-Replayed.',
    explanation:
      'POST не идемпотентен: каждый вызов создаёт новый ресурс. Ключ идемпотентности позволяет серверу распознать повтор и вернуть прежний результат. Ключ создаёт клиент — один на операцию, а не на попытку. Повтор с тем же ключом, но другим телом — ошибка (здесь 422). В кейсе ключ — идентификатор задачи провижининга.',
    solution: [
      `curl -X POST ${H}/orders -H "Authorization: Bearer ${TOKEN}" -H "Idempotency-Key: order-001" --json '{"customerId":"C-77","items":[{"sku":"CARD-GOLD","quantity":1}]}'`,
      `curl -X POST ${H}/orders -H "Authorization: Bearer ${TOKEN}" -H "Idempotency-Key: order-001" --json '{"customerId":"C-77","items":[{"sku":"CARD-GOLD","quantity":1}]}'`,
    ],
    check: (log) => {
      const posts = log.filter((e) => e.route === 'POST /orders' && e.res.status === 201 && getHeader(e.req.headers, 'Idempotency-Key'));
      return posts.some((e) => getHeader(e.res.headers, 'Idempotent-Replayed') === 'true');
    },
  },
  {
    id: 'forbidden',
    code: '403',
    title: 'Нет прав на платёж',
    story: 'Платёж по заказу отвечает 403, хотя токен действующий. Выясните, чего не хватает, и проведите платёж. Нужен orderId — возьмите его из предыдущего задания или GET /orders.',
    goal: 'Ответ 201 на POST /payments',
    mode: 'curl',
    start: `curl -X POST ${H}/payments \\\n  -H "Authorization: Bearer <токен lab-client>" \\\n  --json '{"orderId":"<orderId>","amount":1500}'`,
    hint: 'В 403 указано требуемое право. У клиента payments-client (секрет payments-secret) оно есть — получите токен для него.',
    explanation:
      '403 Forbidden — клиент аутентифицирован, но прав (scope) недостаточно. Новый токен того же клиента не поможет — нужен клиент или пользователь с нужным правом. Повторять запрос без изменений бессмысленно.',
    solution: [
      `curl -X POST ${H}/auth/token -d 'grant_type=client_credentials&client_id=payments-client&client_secret=payments-secret'`,
      `curl -X POST ${H}/payments -H "Authorization: Bearer ${PAY_TOKEN}" --json '{"orderId":"${ORDER}","amount":1500}'`,
    ],
    check: (log) => log.some((e) => ok(e, 'POST /payments', 201)),
  },
  {
    id: 'rate-limit',
    code: '429',
    title: 'Слишком много платежей',
    story: 'При пакетной отправке платежи начинают отвечать 429. Отправляйте платежи подряд, пока не получите 429, затем выполните следующий платёж правильно — не раньше, чем разрешает сервер.',
    goal: 'Получить 429 и после ожидания по Retry-After — 201 на POST /payments',
    mode: 'curl',
    start: `curl -X POST ${H}/payments \\\n  -H "Authorization: Bearer <токен payments-client>" \\\n  --json '{"orderId":"<orderId>","amount":100}'`,
    hint: 'Заголовок Retry-After — сколько секунд ждать. Повтор раньше снова получит 429.',
    explanation:
      '429 Too Many Requests — превышен лимит частоты. Это техническая, временная ошибка: повторять можно, но не раньше Retry-After, иначе клиент сам продлевает перегрузку. Именно так в кейсе (CHG-01) предлагается изменить политику повторов после инцидента INC-01.',
    solution: [], // проверяется отдельно: нужны реальные паузы
    check: (log) => {
      const i = log.findIndex((e) => e.route === 'POST /payments' && e.res.status === 429);
      if (i < 0) return false;
      const wait = retryAfter(log[i]) * 1000;
      return log.slice(i + 1).some((e) => ok(e, 'POST /payments', 201) && e.at - log[i].at >= wait);
    },
  },
  {
    id: 'precondition',
    code: '412',
    title: 'Кто-то изменил запись',
    story: 'Обновление телефона сотрудника E-1002 отвечает 412. Почините, не потеряв чужое изменение.',
    goal: 'Ответ 200 на PATCH /employees/E-1002',
    mode: 'raw',
    start: `PATCH /employees/E-1002 HTTP/1.1\nHost: api.lab.local\nAuthorization: Bearer <ваш токен>\nContent-Type: application/merge-patch+json\nIf-Match: "v1"\n\n{"phone": "+7 900 555-12-12"}`,
    hint: 'Перечитайте запись GET /employees/E-1002 и возьмите актуальный ETag из заголовков ответа.',
    explanation:
      '412 Precondition Failed — условие If-Match не выполнено: запись изменилась с момента, когда вы её читали (оптимистическая блокировка). Решение — перечитать запись, проверить изменения и повторить с новым ETag. Без If-Match сервер вернёт 428 Precondition Required — он требует условный запрос.',
    solution: [`GET /employees/E-1002 HTTP/1.1\nHost: api.lab.local\nAuthorization: Bearer ${TOKEN}\n`, `PATCH /employees/E-1002 HTTP/1.1\nHost: api.lab.local\nAuthorization: Bearer ${TOKEN}\nContent-Type: application/merge-patch+json\nIf-Match: "v2"\n\n{"phone": "+7 900 555-12-12"}`],
    check: (log) => log.some((e) => e.route === 'PATCH /employees/{id}' && e.res.status === 200 && e.req.url.includes('E-1002')),
  },
  {
    id: 'unavailable',
    code: '503',
    title: 'Закрытие дня',
    story: 'Запрос курсов валют отвечает 503. Получите курсы, не создавая лишней нагрузки на сервер.',
    goal: 'После 503 — ответ 200 на GET /exchange-rates не раньше Retry-After',
    mode: 'curl',
    start: `curl ${H}/exchange-rates -H "Authorization: Bearer <ваш токен>"`,
    hint: 'Ответ 503 содержит Retry-After. Подождите указанное время и повторите.',
    explanation:
      '503 Service Unavailable — сервис временно не может обработать запрос (обслуживание, перегрузка). Это техническая ошибка: повтор уместен, с паузой из Retry-After или с нарастающей задержкой. В кейсе адаптер АБС отвечает 503 во время закрытия дня.',
    solution: [],
    check: (log) => {
      const i = log.findIndex((e) => e.route === 'GET /exchange-rates' && e.res.status === 503);
      if (i < 0) return false;
      const wait = retryAfter(log[i]) * 1000;
      return log.slice(i + 1).some((e) => ok(e, 'GET /exchange-rates', 200) && e.at - log[i].at >= wait);
    },
  },
  {
    id: 'timeout',
    code: 'тайм-аут',
    title: 'Отчёт не успевает',
    story: 'Дневной отчёт не приходит: клиент обрывает ожидание по тайм-ауту. Получите отчёт другим способом, который поддерживает API.',
    goal: 'Статус отчёта done в ответе GET /reports/{id}',
    mode: 'curl',
    start: `curl ${H}/reports/daily-sync -H "Authorization: Bearer <ваш токен>"`,
    hint: 'Посмотрите вкладку «Учебный API»: отчёт можно заказать асинхронно — POST /reports, затем опрашивать адрес из Location.',
    explanation:
      'Долгая операция в синхронном вызове упирается в тайм-ауты клиента и шлюзов. Асинхронный шаблон: POST возвращает 202 Accepted и адрес статуса (Location), клиент опрашивает его с паузой из Retry-After. Тайм-аут — не ответ сервера: операция могла выполниться, поэтому слепо повторять неидемпотентные запросы после тайм-аута нельзя.',
    solution: [],
    check: (log) => log.some((e) => ok(e, 'GET /reports/{id}', 200) && body(e)?.status === 'done'),
  },
  {
    id: 'server-error',
    code: '500',
    title: 'Ошибка сервера',
    story: 'Заказ с позицией количеством 0 возвращает 500. Разберитесь: это ваша ошибка или сервера? Затем создайте корректный заказ.',
    goal: 'Получить 500 и затем 201 на POST /orders с количеством больше нуля',
    mode: 'curl',
    start: `curl -X POST ${H}/orders \\\n  -H "Authorization: Bearer <ваш токен>" \\\n  --json '{"customerId":"C-78","items":[{"sku":"CARD-CLASSIC","quantity":0}]}'`,
    hint: 'Ответ 500 — всегда ошибка сервера, даже если данные неверные. Что должен был ответить корректный сервер?',
    explanation:
      'Количество 0 — неверные данные клиента, но корректный сервер должен ответить 4xx (здесь — 422 с указанием поля), а не 500. 500 Internal Server Error — дефект сервера. В описании дефекта: запрос (лучше в виде curl), время, идентификатор ошибки из ответа (errorId), ожидаемое поведение — 422.',
    solution: [
      `curl -X POST ${H}/orders -H "Authorization: Bearer ${TOKEN}" --json '{"customerId":"C-78","items":[{"sku":"CARD-CLASSIC","quantity":0}]}'`,
      `curl -X POST ${H}/orders -H "Authorization: Bearer ${TOKEN}" --json '{"customerId":"C-78","items":[{"sku":"CARD-CLASSIC","quantity":1}]}'`,
    ],
    check: (log) => {
      const i = log.findIndex((e) => e.route === 'POST /orders' && e.res.status === 500);
      return i >= 0 && log.slice(i + 1).some((e) => ok(e, 'POST /orders', 201));
    },
  },
  {
    id: 'not-found',
    code: '404',
    title: 'Сотрудники отдела',
    story: 'Нужен список сотрудников ИТ-отдела (department = it). Запрос отвечает 404.',
    goal: 'Ответ 200 на GET /employees с непустым списком сотрудников отдела it',
    mode: 'curl',
    start: `curl ${H}/employees/it -H "Authorization: Bearer <ваш токен>"`,
    hint: 'В пути — идентификатор конкретного ресурса, а фильтр по признаку передаётся параметром запроса: ?department=…',
    explanation:
      '404 Not Found — ресурса по этому адресу нет: /employees/it ищет сотрудника с id «it». Фильтры передаются в query (?department=it). Обратная ловушка: пустой результат фильтра — это 200 с пустым списком, а не 404.',
    solution: [`curl "${H}/employees?department=it" -H "Authorization: Bearer ${TOKEN}"`],
    check: (log) => log.some((e) => ok(e, 'GET /employees', 200) && e.req.url.includes('department=it') && Array.isArray(body(e)) && body(e).length > 0),
  },
];
