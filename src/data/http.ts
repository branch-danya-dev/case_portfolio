/**
 * Данные справочника HTTP (инструмент tools/http-reference).
 * Источники: RFC 9110 (HTTP Semantics), RFC 5789 (PATCH), RFC 6585 (428, 429), RFC 9457 (Problem Details).
 * Примеры из кейса — по контрактам idm-api.openapi.yaml и abs-adapter.openapi.yaml.
 */

export type Retry = 'yes' | 'no' | 'maybe';

export interface HttpStatus {
  code: number;
  name: string;
  ru: string;
  when: string;
  /** С чем путают и как различать. */
  notConfuse?: string;
  retry: Retry;
  retryNote?: string;
  rfc: string;
  caseExample?: string;
  /** Часто встречается в API — показывать в кратком списке. */
  common?: boolean;
}

export interface HttpMethod {
  method: string;
  ru: string;
  safe: boolean;
  idempotent: boolean;
  requestBody: string;
  when: string;
  responses: string;
  caseExample?: string;
  rfc: string;
}

export interface HttpHeader {
  name: string;
  direction: 'запрос' | 'ответ' | 'запрос и ответ';
  what: string;
  example: string;
  note?: string;
}

export const STATUSES: HttpStatus[] = [
  // 2xx
  {
    code: 200,
    name: 'OK',
    ru: 'Успех',
    when: 'Запрос выполнен, в теле — результат: данные для GET, актуальное состояние после действия.',
    notConfuse: 'Создание ресурса — 201; успех без тела — 204.',
    retry: 'no',
    rfc: 'RFC 9110',
    caseExample: 'POST /users в адаптере АБС с тем же Idempotency-Key — 200 и ранее созданный пользователь.',
    common: true,
  },
  {
    code: 201,
    name: 'Created',
    ru: 'Создано',
    when: 'Создан новый ресурс. В заголовке Location — адрес созданного ресурса, в теле — обычно его представление.',
    notConfuse: 'Если запрос только принят в обработку, а ресурса ещё нет — 202.',
    retry: 'no',
    rfc: 'RFC 9110',
    caseExample: 'POST /access-requests — 201 и Location с адресом заявки.',
    common: true,
  },
  {
    code: 202,
    name: 'Accepted',
    ru: 'Принято в обработку',
    when: 'Запрос принят, но обработка асинхронная и ещё не завершена. Хорошая практика — вернуть ссылку, по которой можно узнать статус.',
    notConfuse: '202 не гарантирует успеха — результат может оказаться ошибкой. Если ресурс уже создан — 201.',
    retry: 'no',
    rfc: 'RFC 9110',
    common: true,
  },
  {
    code: 204,
    name: 'No Content',
    ru: 'Успех без тела',
    when: 'Действие выполнено, возвращать нечего: удаление, назначение роли, приём webhook.',
    notConfuse: 'Если клиенту нужно новое состояние ресурса — 200 с телом.',
    retry: 'no',
    rfc: 'RFC 9110',
    caseExample: 'DELETE /users/{login} — 204 «удалён или уже отсутствовал»; webhook ServiceDesk — 204 «принято».',
    common: true,
  },
  {
    code: 206,
    name: 'Partial Content',
    ru: 'Часть содержимого',
    when: 'Ответ на запрос диапазона (заголовок Range) — например, докачка большого файла.',
    notConfuse: 'Пагинация списков обычно делается параметрами запроса и 200, а не через 206.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  // 3xx
  {
    code: 301,
    name: 'Moved Permanently',
    ru: 'Перемещён навсегда',
    when: 'Ресурс навсегда переехал на адрес из Location.',
    notConfuse: 'Клиенты исторически могут сменить POST на GET при переходе — чтобы сохранить метод, используйте 308.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 302,
    name: 'Found',
    ru: 'Временно по другому адресу',
    when: 'Ресурс временно доступен по адресу из Location.',
    notConfuse: 'Метод при переходе может смениться на GET; сохранить метод — 307.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 303,
    name: 'See Other',
    ru: 'Смотрите другой ресурс',
    when: 'После POST направить клиента GET-запросом на другой ресурс — например, на страницу результата.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 304,
    name: 'Not Modified',
    ru: 'Не изменился',
    when: 'Условный GET (If-None-Match, If-Modified-Since): у клиента актуальная копия, тело не передаётся.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 307,
    name: 'Temporary Redirect',
    ru: 'Временное перенаправление',
    when: 'Как 302, но метод и тело запроса при переходе сохраняются.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 308,
    name: 'Permanent Redirect',
    ru: 'Постоянное перенаправление',
    when: 'Как 301, но метод и тело запроса сохраняются.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  // 4xx
  {
    code: 400,
    name: 'Bad Request',
    ru: 'Неверный запрос',
    when: 'Запрос нельзя обработать из-за ошибки клиента: синтаксис JSON, неверный тип или формат поля, нет обязательного параметра.',
    notConfuse: 'Синтаксически верный запрос, нарушающий бизнес-правило, многие API возвращают как 422. Какой код для чего — зафиксируйте в соглашениях API.',
    retry: 'no',
    retryNote: 'Повтор того же запроса даст тот же ответ — нужно исправить запрос.',
    rfc: 'RFC 9110',
    common: true,
  },
  {
    code: 401,
    name: 'Unauthorized',
    ru: 'Не аутентифицирован',
    when: 'Нет учётных данных или они недействительны: нет токена, токен истёк. Ответ должен содержать заголовок WWW-Authenticate.',
    notConfuse: 'Несмотря на название, это про аутентификацию («кто ты?»). Нет прав у известного клиента — 403.',
    retry: 'maybe',
    retryNote: 'Получить новый токен и повторить.',
    rfc: 'RFC 9110',
    common: true,
  },
  {
    code: 403,
    name: 'Forbidden',
    ru: 'Доступ запрещён',
    when: 'Клиент известен, но прав на действие нет.',
    notConfuse: 'Чтобы не раскрывать само существование ресурса, иногда вместо 403 возвращают 404.',
    retry: 'no',
    rfc: 'RFC 9110',
    caseExample: 'GET /employees/{employeeNumber}/access — 403, если руководитель запрашивает не своего подчинённого (SEC-10).',
    common: true,
  },
  {
    code: 404,
    name: 'Not Found',
    ru: 'Не найден',
    when: 'Ресурса по этому адресу нет.',
    notConfuse: 'Пустой результат поиска по фильтру — это 200 с пустым списком, а не 404. Ресурс удалён навсегда и это важно — 410.',
    retry: 'no',
    rfc: 'RFC 9110',
    caseExample: 'PATCH /users/{login} в адаптере АБС — 404, если пользователя нет.',
    common: true,
  },
  {
    code: 405,
    name: 'Method Not Allowed',
    ru: 'Метод не поддерживается',
    when: 'Ресурс есть, но этот метод для него не поддерживается. Ответ должен содержать заголовок Allow со списком методов.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 406,
    name: 'Not Acceptable',
    ru: 'Неприемлемый формат ответа',
    when: 'Сервер не может вернуть ответ в формате из заголовка Accept.',
    notConfuse: 'Неподдерживаемый формат тела запроса — 415.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 408,
    name: 'Request Timeout',
    ru: 'Сервер не дождался запроса',
    when: 'Клиент слишком долго отправлял запрос, сервер закрывает соединение.',
    notConfuse: 'Не путать с тайм-аутом ответа сервера: его клиент видит сам, без кода, а шлюз сообщает 504.',
    retry: 'yes',
    rfc: 'RFC 9110',
  },
  {
    code: 409,
    name: 'Conflict',
    ru: 'Конфликт',
    when: 'Запрос противоречит текущему состоянию ресурса: дубль по уникальному ключу, недопустимый переход статуса, параллельное изменение.',
    notConfuse: 'Конфликт версии при условном запросе (If-Match) — 412.',
    retry: 'no',
    retryNote: 'Сначала разрешить конфликт: перечитать состояние.',
    rfc: 'RFC 9110',
    caseExample:
      'POST /users — логин занят другим пользователем; DELETE /users/{login} — у пользователя есть операции в АБС; webhook о закрытии задачи, которая уже отменена.',
    common: true,
  },
  {
    code: 410,
    name: 'Gone',
    ru: 'Удалён навсегда',
    when: 'Ресурс был, но удалён и не вернётся — например, выведенная из эксплуатации версия API.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 412,
    name: 'Precondition Failed',
    ru: 'Предусловие не выполнено',
    when: 'Не выполнено условие из заголовка запроса, чаще всего If-Match: ресурс изменился с момента чтения (оптимистичная блокировка).',
    retry: 'no',
    retryNote: 'Перечитать ресурс, получить новый ETag, повторить изменение.',
    rfc: 'RFC 9110',
  },
  {
    code: 413,
    name: 'Content Too Large',
    ru: 'Слишком большое тело',
    when: 'Тело запроса больше допустимого. В RFC 9110 код называется Content Too Large, раньше — Payload Too Large.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 415,
    name: 'Unsupported Media Type',
    ru: 'Неподдерживаемый формат тела',
    when: 'Content-Type запроса не поддерживается — например, прислали XML вместо JSON.',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 422,
    name: 'Unprocessable Content',
    ru: 'Запрос понятен, но не выполним',
    when: 'Синтаксис и формат верны, но запрос нарушает бизнес-правила или ссылается на несуществующие данные.',
    notConfuse: 'Ошибка формата — 400. Противоречие состоянию ресурса — 409.',
    retry: 'no',
    rfc: 'RFC 9110',
    caseExample: 'POST /users в адаптере АБС — 422 при неизвестном branchCode; по политике FR-16 такая бизнес-ошибка не повторяется.',
    common: true,
  },
  {
    code: 428,
    name: 'Precondition Required',
    ru: 'Нужно предусловие',
    when: 'Сервер требует условный запрос (например, с If-Match), чтобы исключить потерю параллельных изменений.',
    retry: 'no',
    rfc: 'RFC 6585',
  },
  {
    code: 429,
    name: 'Too Many Requests',
    ru: 'Слишком много запросов',
    when: 'Превышен лимит запросов. Заголовок Retry-After подсказывает, когда повторить.',
    retry: 'yes',
    retryNote: 'После паузы из Retry-After или с экспоненциальной задержкой.',
    rfc: 'RFC 6585',
    caseExample: 'По политике повторов FR-16 429 считается технической ошибкой — повторяется.',
    common: true,
  },
  // 5xx
  {
    code: 500,
    name: 'Internal Server Error',
    ru: 'Внутренняя ошибка сервера',
    when: 'Непредвиденная ошибка на сервере. Детали — в логах, клиенту — идентификатор для поддержки, без стека и внутренностей.',
    retry: 'maybe',
    retryNote: 'Повторять можно идемпотентные запросы или запросы с ключом идемпотентности.',
    rfc: 'RFC 9110',
    common: true,
  },
  {
    code: 501,
    name: 'Not Implemented',
    ru: 'Не реализовано',
    when: 'Сервер не поддерживает функциональность, нужную для запроса (например, неизвестный метод).',
    retry: 'no',
    rfc: 'RFC 9110',
  },
  {
    code: 502,
    name: 'Bad Gateway',
    ru: 'Ошибка шлюза',
    when: 'Шлюз или прокси получил некорректный ответ от вышестоящего сервера.',
    retry: 'yes',
    retryNote: 'Для идемпотентных запросов или с ключом идемпотентности.',
    rfc: 'RFC 9110',
    common: true,
  },
  {
    code: 503,
    name: 'Service Unavailable',
    ru: 'Сервис недоступен',
    when: 'Сервер временно не может обработать запрос: перегрузка, регламентные работы. Можно указать Retry-After.',
    retry: 'yes',
    retryNote: 'С паузой; для идемпотентных запросов или с ключом идемпотентности.',
    rfc: 'RFC 9110',
    caseExample: 'POST /users в адаптере АБС — 503 при закрытии дня и регламентных работах; IdM повторяет по FR-16 (тест TC-12).',
    common: true,
  },
  {
    code: 504,
    name: 'Gateway Timeout',
    ru: 'Тайм-аут шлюза',
    when: 'Шлюз или прокси не дождался ответа от вышестоящего сервера.',
    notConfuse: 'Операция могла выполниться! Повтор без ключа идемпотентности рискует создать дубль.',
    retry: 'yes',
    retryNote: 'Только идемпотентные запросы или с ключом идемпотентности.',
    rfc: 'RFC 9110',
    common: true,
  },
];

export const METHODS: HttpMethod[] = [
  {
    method: 'GET',
    ru: 'Получить',
    safe: true,
    idempotent: true,
    requestBody: 'Нет (семантика тела не определена)',
    when: 'Прочитать ресурс или список. Параметры фильтрации и пагинации — в query.',
    responses: '200, 304, 404',
    caseExample: 'GET /employees/{employeeNumber}/access — доступы сотрудника с основаниями выдачи.',
    rfc: 'RFC 9110',
  },
  {
    method: 'HEAD',
    ru: 'Заголовки без тела',
    safe: true,
    idempotent: true,
    requestBody: 'Нет',
    when: 'Как GET, но без тела ответа: проверить существование, размер, ETag.',
    responses: '200, 304, 404',
    rfc: 'RFC 9110',
  },
  {
    method: 'POST',
    ru: 'Создать / выполнить',
    safe: false,
    idempotent: false,
    requestBody: 'Да',
    when: 'Создать ресурс в коллекции, когда идентификатор назначает сервер; выполнить действие, которое не укладывается в CRUD. Для безопасных повторов — заголовок Idempotency-Key.',
    responses: '201, 200, 202, 400, 409, 422',
    caseExample: 'POST /access-requests — создать заявку; POST /access-requests/{id}/items/{itemId}/decisions — решение согласующего.',
    rfc: 'RFC 9110',
  },
  {
    method: 'PUT',
    ru: 'Заменить / создать по известному адресу',
    safe: false,
    idempotent: true,
    requestBody: 'Да — полное представление',
    when: 'Полностью заменить ресурс или создать его по адресу, который знает клиент. Повтор даёт тот же результат.',
    responses: '200, 201, 204, 409, 412',
    caseExample: 'PUT /users/{login}/roles/{roleCode} в адаптере АБС — назначить роль; повтор безопасен.',
    rfc: 'RFC 9110',
  },
  {
    method: 'PATCH',
    ru: 'Частично изменить',
    safe: false,
    idempotent: false,
    requestBody: 'Да — описание изменений',
    when: 'Изменить часть полей ресурса. Идемпотентность зависит от формата изменений: «установить статус» идемпотентно, «увеличить на 1» — нет.',
    responses: '200, 204, 404, 409, 412, 422',
    caseExample: 'PATCH /users/{login} в адаптере АБС — изменить статус пользователя.',
    rfc: 'RFC 5789',
  },
  {
    method: 'DELETE',
    ru: 'Удалить',
    safe: false,
    idempotent: true,
    requestBody: 'Обычно нет',
    when: 'Удалить ресурс. Повторное удаление не меняет состояние — поэтому повтор можно вернуть как 204 или 404 (договоритесь в API).',
    responses: '204, 200, 202, 404, 409',
    caseExample: 'DELETE /users/{login} в адаптере АБС — 204 «удалён или уже отсутствовал», 409 если у пользователя есть операции.',
    rfc: 'RFC 9110',
  },
  {
    method: 'OPTIONS',
    ru: 'Возможности ресурса',
    safe: true,
    idempotent: true,
    requestBody: 'Нет',
    when: 'Узнать поддерживаемые методы; браузер отправляет его как предварительный CORS-запрос.',
    responses: '200, 204',
    rfc: 'RFC 9110',
  },
];

export const HEADERS: HttpHeader[] = [
  { name: 'Content-Type', direction: 'запрос и ответ', what: 'Формат тела.', example: 'Content-Type: application/json', note: 'Ошибки по RFC 9457 — application/problem+json.' },
  { name: 'Accept', direction: 'запрос', what: 'Какие форматы ответа понимает клиент.', example: 'Accept: application/json', note: 'Нет подходящего — 406.' },
  { name: 'Authorization', direction: 'запрос', what: 'Учётные данные клиента.', example: 'Authorization: Bearer <access token>', note: 'Нет или недействительны — 401.' },
  { name: 'WWW-Authenticate', direction: 'ответ', what: 'Как аутентифицироваться; обязателен в ответе 401.', example: 'WWW-Authenticate: Bearer realm="idm"' },
  { name: 'Location', direction: 'ответ', what: 'Адрес созданного ресурса (201) или цель перенаправления (3xx).', example: 'Location: /access-requests/42' },
  { name: 'Allow', direction: 'ответ', what: 'Поддерживаемые методы ресурса; обязателен в ответе 405.', example: 'Allow: GET, POST' },
  { name: 'Retry-After', direction: 'ответ', what: 'Через сколько секунд (или когда) повторить — с 429, 503, 3xx.', example: 'Retry-After: 120' },
  { name: 'ETag', direction: 'ответ', what: 'Версия представления ресурса для кэширования и оптимистичной блокировки.', example: 'ETag: "v17"' },
  { name: 'If-Match', direction: 'запрос', what: 'Изменить, только если версия совпадает с ETag; иначе 412.', example: 'If-Match: "v17"' },
  { name: 'If-None-Match', direction: 'запрос', what: 'Вернуть ресурс, только если версия изменилась; иначе 304.', example: 'If-None-Match: "v17"' },
  { name: 'Cache-Control', direction: 'запрос и ответ', what: 'Правила кэширования.', example: 'Cache-Control: no-store', note: 'Для ответов с персональными данными — no-store.' },
  {
    name: 'Idempotency-Key',
    direction: 'запрос',
    what: 'Ключ, по которому сервер распознаёт повтор неидемпотентного запроса (POST) и возвращает прежний результат.',
    example: 'Idempotency-Key: 8e03978e-40d5-43e8-bc93-6894a57f9324',
    note: 'Описан в черновике IETF; в кейсе — ключ задачи провижининга (FR-16).',
  },
  { name: 'traceparent', direction: 'запрос', what: 'Идентификатор трассировки по стандарту W3C Trace Context — связывает логи всех систем одного запроса.', example: 'traceparent: 00-<trace-id>-<span-id>-01' },
];

/** Типовые ситуации: какой код вернуть. */
export const SCENARIOS: { situation: string; codes: number[]; note: string }[] = [
  { situation: 'Ресурс создан, идентификатор назначил сервер', codes: [201], note: 'Location с адресом, в теле — ресурс.' },
  { situation: 'Повтор POST с тем же ключом идемпотентности', codes: [200, 201], note: 'Вернуть прежний результат; в кейсе — 200 и ранее созданный объект.' },
  { situation: 'Запрос принят, результат будет позже', codes: [202], note: 'Вернуть ссылку на статус операции.' },
  { situation: 'Удалено / действие выполнено, тело не нужно', codes: [204], note: '' },
  { situation: 'Список по фильтру пуст', codes: [200], note: 'Пустой массив, а не 404.' },
  { situation: 'Невалидный JSON, неверный тип поля, нет обязательного поля', codes: [400], note: 'Тело — Problem Details со списком ошибок по полям.' },
  { situation: 'Нарушено бизнес-правило, ссылка на несуществующий справочник', codes: [422, 400], note: 'Выберите одно соглашение для всего API.' },
  { situation: 'Нет токена или токен истёк', codes: [401], note: 'С заголовком WWW-Authenticate.' },
  { situation: 'Пользователь известен, прав нет', codes: [403, 404], note: '404 — если нельзя раскрывать существование ресурса.' },
  { situation: 'Дубль по уникальному ключу, недопустимый переход статуса', codes: [409], note: 'В теле — что именно конфликтует.' },
  { situation: 'Ресурс изменён другим пользователем с момента чтения', codes: [412], note: 'При условном запросе с If-Match.' },
  { situation: 'Превышен лимит запросов', codes: [429], note: 'С Retry-After.' },
  { situation: 'Зависимая система недоступна', codes: [503, 502], note: '503 — сервис временно не может работать; 502 — шлюз получил плохой ответ.' },
  { situation: 'Зависимая система не ответила вовремя', codes: [504], note: 'Операция могла выполниться — повтор только идемпотентно.' },
  { situation: 'Непредвиденная ошибка', codes: [500], note: 'Без стека в ответе; идентификатор для поддержки.' },
];
