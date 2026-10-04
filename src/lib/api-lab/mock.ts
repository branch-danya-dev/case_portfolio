/**
 * Учебный API для API Lab. Работает в браузере, в памяти; сеть не используется.
 * Каждая ошибка возникает «честно» — из-за конкретной ошибки в запросе или условия на сервере:
 * 400, 401, 403, 404, 405, 409, 412, 415, 422, 428, 429, 500, 503 и тайм-аут.
 * Формат ошибок — Problem Details (RFC 9457), application/problem+json.
 */
import { CLIENT_TIMEOUT_MS, getHeader, splitUrl, type Header, type LabRequest, type LabResponse } from './http';

export interface Exchange {
  req: LabRequest;
  res: LabResponse;
  at: number;
  /** Маршрут, который обработал запрос: «POST /users». */
  route: string;
}

interface Client {
  secret: string;
  scope: string[];
}
interface Token {
  client: string;
  scope: string[];
  expiresAt: number;
}
interface User {
  login: string;
  lastName: string;
  firstName: string;
  branchCode: string;
  status: 'BLOCKED' | 'ACTIVE';
}
interface Order {
  orderId: string;
  customerId: string;
  items: { sku: string; quantity: number }[];
  createdAt: string;
}
interface Employee {
  id: string;
  name: string;
  department: string;
  phone: string;
  version: number;
}
interface StoredResponse {
  bodyHash: string;
  res: Omit<LabResponse, 'latencyMs'>;
}

export const CLIENTS: Record<string, Client> = {
  'lab-client': { secret: 'lab-secret', scope: ['read', 'write'] },
  'payments-client': { secret: 'payments-secret', scope: ['read', 'payments:write'] },
};
export const BRANCHES = [
  { code: '000', name: 'Головной офис' },
  { code: '066', name: 'Доп. офис «Екатеринбург-Центр»' },
  { code: '025', name: 'Доп. офис «Владивосток»' },
];
const RATE_LIMIT = { max: 2, windowMs: 10_000 };
const RATES_MAINTENANCE_MS = 8_000;
const REPORT_READY_MS = 4_000;
const SLOW_REPORT_MS = 8_000;

const json = (v: unknown) => JSON.stringify(v, null, 2);
const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h);
};

class HttpError extends Error {
  constructor(
    public status: number,
    public title: string,
    public detail: string,
    public extra: Record<string, unknown> = {},
    public headers: Header[] = [],
  ) {
    super(detail);
  }
}

export class MockApi {
  log: Exchange[] = [];
  tokens = new Map<string, Token>();
  users = new Map<string, User>();
  orders: Order[] = [];
  employees = new Map<string, Employee>();
  idem = new Map<string, StoredResponse>();
  payments: { paymentId: string; orderId: string; amount: number }[] = [];
  payHits = new Map<string, number[]>();
  ratesDownUntil = 0;
  ratesTouched = false;
  reports = new Map<string, { createdAt: number }>();
  /** Счётчики для идентификаторов. */
  private seq = { order: 1000, pay: 5000, report: 1, token: 1, err: 1 };

  constructor(public clock: () => number = () => Date.now()) {
    this.reset();
  }

  reset() {
    this.log = [];
    this.tokens.clear();
    this.users = new Map([
      ['IVANOV.AP', { login: 'IVANOV.AP', lastName: 'Иванов', firstName: 'Алексей', branchCode: '066', status: 'BLOCKED' }],
      ['PETROV.OI', { login: 'PETROV.OI', lastName: 'Петров', firstName: 'Олег', branchCode: '025', status: 'ACTIVE' }],
    ]);
    this.orders = [];
    this.employees = new Map([
      ['E-1001', { id: 'E-1001', name: 'Смирнова Елена', department: 'retail', phone: '+7 900 000-10-01', version: 1 }],
      ['E-1002', { id: 'E-1002', name: 'Кузнецов Дмитрий', department: 'retail', phone: '+7 900 000-10-02', version: 2 }],
      ['E-1003', { id: 'E-1003', name: 'Щукина Юлия', department: 'it', phone: '+7 900 000-10-03', version: 1 }],
    ]);
    this.idem.clear();
    this.payments = [];
    this.payHits.clear();
    this.ratesDownUntil = 0;
    this.ratesTouched = false;
    this.reports.clear();
    this.seq = { order: 1000, pay: 5000, report: 1, token: 1, err: 1 };
  }

  /** Обработать запрос. Задержка «сети» и тайм-аут считаются, но не ждутся — ответ возвращается сразу. */
  handle(req: LabRequest): Exchange {
    const at = this.clock();
    const { path } = splitUrl(req.url);
    let route = `${req.method} ${path}`;
    let res: LabResponse;
    try {
      const r = this.route(req);
      route = r.route;
      res = { ...r.res, latencyMs: r.latency ?? 20 + (hash(req.method + path + at) >>> 0) % 60 };
    } catch (e) {
      if (!(e instanceof HttpError)) throw e;
      res = this.problem(e, path);
    }
    if (res.latencyMs > CLIENT_TIMEOUT_MS) res = { status: 0, headers: [], body: '', latencyMs: CLIENT_TIMEOUT_MS, timeout: true };
    const ex = { req, res, at, route };
    this.log.push(ex);
    return ex;
  }

  private problem(e: HttpError, path: string): LabResponse {
    return {
      status: e.status,
      headers: [['Content-Type', 'application/problem+json'], ...e.headers],
      body: json({ type: `https://api.lab.local/problems/${e.status}`, title: e.title, status: e.status, detail: e.detail, instance: path, ...e.extra }),
      latencyMs: 25,
    };
  }

  private ok(status: number, body: unknown, headers: Header[] = []): { status: number; headers: Header[]; body: string } {
    return { status, headers: body === undefined ? headers : [['Content-Type', 'application/json'], ...headers], body: body === undefined ? '' : json(body) };
  }

  // ---------- общие проверки ----------

  private auth(req: LabRequest, scope?: string): Token {
    const h = getHeader(req.headers, 'Authorization');
    const www: Header = ['WWW-Authenticate', 'Bearer realm="api-lab"'];
    if (!h) throw new HttpError(401, 'Unauthorized', 'Нет заголовка Authorization. Получите токен: POST /auth/token и передайте его как «Authorization: Bearer <токен>».', {}, [www]);
    const m = h.match(/^Bearer\s+(\S+)$/i);
    if (!m) throw new HttpError(401, 'Unauthorized', `Ожидается схема Bearer, получено «${h.split(' ')[0]}».`, {}, [www]);
    const t = this.tokens.get(m[1]);
    if (!t) throw new HttpError(401, 'Unauthorized', 'Токен неизвестен — скопируйте access_token из ответа /auth/token целиком.', {}, [['WWW-Authenticate', 'Bearer realm="api-lab", error="invalid_token"']]);
    if (t.expiresAt <= this.clock()) throw new HttpError(401, 'Unauthorized', 'Срок действия токена истёк — получите новый.', {}, [['WWW-Authenticate', 'Bearer realm="api-lab", error="invalid_token"']]);
    if (scope && !t.scope.includes(scope))
      throw new HttpError(403, 'Forbidden', `У токена клиента «${t.client}» нет права «${scope}». Права токена: ${t.scope.join(', ')}.`, { requiredScope: scope });
    return t;
  }

  private jsonBody(req: LabRequest, types = ['application/json']): Record<string, unknown> {
    const ct = (getHeader(req.headers, 'Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    if (!types.includes(ct))
      throw new HttpError(415, 'Unsupported Media Type', `Тело должно быть в формате ${types.join(' или ')}, а Content-Type запроса — «${ct || 'не указан'}».`, { supported: types });
    if (!req.body.trim()) throw new HttpError(400, 'Bad Request', 'Пустое тело запроса.');
    try {
      const v = JSON.parse(req.body);
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('ожидался JSON-объект');
      return v;
    } catch (e) {
      throw new HttpError(400, 'Bad Request', `Тело не является корректным JSON: ${(e as Error).message}`);
    }
  }

  private requireFields(body: Record<string, unknown>, fields: string[]) {
    const errors = fields.filter((f) => body[f] === undefined || body[f] === '').map((f) => ({ field: f, message: 'обязательное поле' }));
    if (errors.length) throw new HttpError(400, 'Bad Request', 'Не заполнены обязательные поля.', { errors });
  }

  /** Идемпотентность POST по заголовку Idempotency-Key. */
  private idempotent(req: LabRequest, scopeKey: string, run: () => { status: number; headers: Header[]; body: string }) {
    const key = getHeader(req.headers, 'Idempotency-Key');
    if (!key) return run();
    const k = `${scopeKey}:${key}`;
    const stored = this.idem.get(k);
    const bh = hash(req.body.replace(/\s+/g, ''));
    if (stored) {
      if (stored.bodyHash !== bh)
        throw new HttpError(422, 'Unprocessable Content', `Ключ идемпотентности «${key}» уже использован с другим телом запроса. Для новой операции нужен новый ключ.`);
      return { ...stored.res, headers: [...stored.res.headers, ['Idempotent-Replayed', 'true'] as Header] };
    }
    const res = run();
    if (res.status < 500) this.idem.set(k, { bodyHash: bh, res });
    return res;
  }

  // ---------- маршрутизация ----------

  private route(req: LabRequest): { route: string; res: { status: number; headers: Header[]; body: string }; latency?: number } {
    const { path, query } = splitUrl(req.url);
    const p = path.replace(/^\/(api\/)?v1(?=\/)/, ''); // /v1/users и /api/v1/users — то же, что /users
    const m = req.method;
    const seg = p.split('/').filter(Boolean);
    const routes: [RegExp, string[], string][] = [
      [/^\/auth\/token$/, ['POST'], '/auth/token'],
      [/^\/branches$/, ['GET'], '/branches'],
      [/^\/users$/, ['GET', 'POST'], '/users'],
      [/^\/users\/[^/]+$/, ['GET'], '/users/{login}'],
      [/^\/orders$/, ['GET', 'POST'], '/orders'],
      [/^\/payments$/, ['GET', 'POST'], '/payments'],
      [/^\/employees$/, ['GET'], '/employees'],
      [/^\/employees\/[^/]+$/, ['GET', 'PATCH'], '/employees/{id}'],
      [/^\/exchange-rates$/, ['GET'], '/exchange-rates'],
      [/^\/reports$/, ['POST'], '/reports'],
      [/^\/reports\/daily-sync$/, ['GET'], '/reports/daily-sync'],
      [/^\/reports\/[^/]+$/, ['GET'], '/reports/{id}'],
    ];
    const found = routes.find(([re]) => re.test(p));
    if (!found) throw new HttpError(404, 'Not Found', `Ресурса ${path} нет. Список ресурсов — на вкладке «Учебный API».`);
    const [, methods, tpl] = found;
    const route = `${m} ${tpl}`;
    if (m === 'OPTIONS') return { route, res: this.ok(204, undefined, [['Allow', methods.join(', ')]]) };
    if (!methods.includes(m)) throw new HttpError(405, 'Method Not Allowed', `Метод ${m} для ${tpl} не поддерживается.`, {}, [['Allow', methods.join(', ')]]);
    const r = (res: { status: number; headers: Header[]; body: string }, latency?: number) => ({ route, res, latency });

    switch (tpl) {
      case '/auth/token':
        return r(this.token(req));
      case '/branches':
        this.auth(req, 'read');
        return r(this.ok(200, BRANCHES));
      case '/users':
        if (m === 'GET') {
          this.auth(req, 'read');
          return r(this.ok(200, [...this.users.values()]));
        }
        this.auth(req, 'write');
        return r(this.idempotent(req, 'users', () => this.createUser(req)));
      case '/users/{login}': {
        this.auth(req, 'read');
        const u = this.users.get(decodeURIComponent(seg[1]).toUpperCase());
        if (!u) throw new HttpError(404, 'Not Found', `Пользователя «${seg[1]}» нет.`);
        return r(this.ok(200, u));
      }
      case '/orders':
        if (m === 'GET') {
          this.auth(req, 'read');
          return r(this.ok(200, this.orders));
        }
        this.auth(req, 'write');
        return r(this.idempotent(req, 'orders', () => this.createOrder(req)));
      case '/payments':
        if (m === 'GET') {
          this.auth(req, 'read');
          return r(this.ok(200, this.payments));
        }
        return r(this.createPayment(req));
      case '/employees': {
        this.auth(req, 'read');
        const limit = Number(query.get('limit') ?? 20);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'Bad Request', 'Параметр limit — целое число от 1 до 100.', { errors: [{ field: 'limit', message: 'от 1 до 100' }] });
        const dep = query.get('department');
        const list = [...this.employees.values()].filter((e) => !dep || e.department === dep).slice(0, limit);
        return r(this.ok(200, list.map(({ version, ...e }) => e)));
      }
      case '/employees/{id}': {
        const e = this.employees.get(seg[1]);
        if (m === 'GET') {
          this.auth(req, 'read');
          if (!e) throw new HttpError(404, 'Not Found', `Сотрудника «${seg[1]}» нет.`);
          const { version, ...view } = e;
          return r(this.ok(200, view, [['ETag', `"v${version}"`]]));
        }
        this.auth(req, 'write');
        if (!e) throw new HttpError(404, 'Not Found', `Сотрудника «${seg[1]}» нет.`);
        return r(this.patchEmployee(req, e));
      }
      case '/exchange-rates':
        this.auth(req, 'read');
        return r(this.rates());
      case '/reports': {
        this.auth(req, 'read');
        const body = this.jsonBody(req);
        if (body.type !== 'daily') throw new HttpError(422, 'Unprocessable Content', 'Поддерживается только отчёт type = "daily".');
        const id = `R-${this.seq.report++}`;
        this.reports.set(id, { createdAt: this.clock() });
        return r(this.ok(202, { reportId: id, status: 'processing' }, [['Location', `/reports/${id}`], ['Retry-After', String(REPORT_READY_MS / 1000)]]));
      }
      case '/reports/daily-sync':
        this.auth(req, 'read');
        return r(this.ok(200, { report: 'daily' }), SLOW_REPORT_MS);
      case '/reports/{id}': {
        this.auth(req, 'read');
        const rep = this.reports.get(seg[1]);
        if (!rep) throw new HttpError(404, 'Not Found', `Отчёта «${seg[1]}» нет.`);
        const ready = this.clock() - rep.createdAt >= REPORT_READY_MS;
        return r(
          ready
            ? this.ok(200, { reportId: seg[1], status: 'done', rows: 42, total: '1 254 300.00' })
            : this.ok(200, { reportId: seg[1], status: 'processing' }, [['Retry-After', String(Math.ceil((REPORT_READY_MS - (this.clock() - rep.createdAt)) / 1000))]]),
        );
      }
    }
    throw new HttpError(404, 'Not Found', 'Маршрут не найден');
  }

  // ---------- обработчики ----------

  private token(req: LabRequest) {
    const ct = (getHeader(req.headers, 'Content-Type') ?? '').split(';')[0].trim().toLowerCase();
    if (ct !== 'application/x-www-form-urlencoded')
      throw new HttpError(415, 'Unsupported Media Type', `Токен выдаётся по форме application/x-www-form-urlencoded (как в OAuth 2.0), а Content-Type запроса — «${ct || 'не указан'}».`);
    const f = new URLSearchParams(req.body);
    if (f.get('grant_type') !== 'client_credentials') throw new HttpError(400, 'Bad Request', 'grant_type должен быть client_credentials.', { error: 'unsupported_grant_type' });
    const id = f.get('client_id') ?? '';
    const c = CLIENTS[id];
    if (!c || c.secret !== f.get('client_secret')) throw new HttpError(401, 'Unauthorized', 'Неверные client_id или client_secret.', { error: 'invalid_client' });
    const token = `tok_${id.split('-')[0]}_${(this.seq.token++).toString().padStart(4, '0')}`;
    this.tokens.set(token, { client: id, scope: c.scope, expiresAt: this.clock() + 3_600_000 });
    return this.ok(200, { access_token: token, token_type: 'Bearer', expires_in: 3600, scope: c.scope.join(' ') }, [['Cache-Control', 'no-store']]);
  }

  private createUser(req: LabRequest) {
    const b = this.jsonBody(req);
    this.requireFields(b, ['login', 'lastName', 'firstName', 'branchCode']);
    const login = String(b.login);
    if (!/^[A-Z0-9._-]{3,20}$/.test(login))
      throw new HttpError(400, 'Bad Request', 'Неверный формат логина.', { errors: [{ field: 'login', message: 'от 3 до 20 символов: A–Z, цифры, точка, дефис, подчёркивание' }] });
    if (!BRANCHES.some((x) => x.code === b.branchCode))
      throw new HttpError(422, 'Unprocessable Content', `Филиала с кодом «${b.branchCode}» нет в справочнике АБС. Список — GET /branches.`, { errors: [{ field: 'branchCode', message: 'нет в справочнике' }] });
    if (this.users.has(login)) throw new HttpError(409, 'Conflict', `Логин «${login}» уже занят. Посмотреть пользователя — GET /users/${login}.`);
    const u: User = { login, lastName: String(b.lastName), firstName: String(b.firstName), branchCode: String(b.branchCode), status: 'BLOCKED' };
    this.users.set(login, u);
    return this.ok(201, u, [['Location', `/users/${login}`]]);
  }

  private createOrder(req: LabRequest) {
    const b = this.jsonBody(req);
    this.requireFields(b, ['customerId', 'items']);
    if (!Array.isArray(b.items) || !b.items.length) throw new HttpError(400, 'Bad Request', 'items — непустой массив позиций.', { errors: [{ field: 'items', message: 'непустой массив' }] });
    const items = b.items as { sku: string; quantity: number }[];
    // Учебный дефект сервера: деление на количество без проверки — 500 вместо 422.
    if (items.some((i) => Number(i.quantity) === 0)) {
      const errorId = `ERR-${String(this.seq.err++).padStart(4, '0')}`;
      throw new HttpError(500, 'Internal Server Error', `Внутренняя ошибка. Сообщите в поддержку идентификатор ${errorId}.`, { errorId });
    }
    const o: Order = { orderId: `ORD-${this.seq.order++}`, customerId: String(b.customerId), items, createdAt: new Date(this.clock()).toISOString() };
    this.orders.push(o);
    return this.ok(201, o, [['Location', `/orders/${o.orderId}`]]);
  }

  private createPayment(req: LabRequest) {
    const t = this.auth(req, 'payments:write');
    const now = this.clock();
    const hits = (this.payHits.get(t.client) ?? []).filter((x) => now - x < RATE_LIMIT.windowMs);
    if (hits.length >= RATE_LIMIT.max) {
      const retry = Math.ceil((RATE_LIMIT.windowMs - (now - hits[0])) / 1000);
      this.payHits.set(t.client, hits);
      throw new HttpError(429, 'Too Many Requests', `Не более ${RATE_LIMIT.max} платежей за ${RATE_LIMIT.windowMs / 1000} секунд на клиента. Повторите через ${retry} с.`, {}, [['Retry-After', String(retry)]]);
    }
    hits.push(now);
    this.payHits.set(t.client, hits);
    return this.idempotent(req, 'payments', () => {
      const b = this.jsonBody(req);
      this.requireFields(b, ['orderId', 'amount']);
      if (!this.orders.some((o) => o.orderId === b.orderId)) throw new HttpError(422, 'Unprocessable Content', `Заказа «${b.orderId}» нет — сначала создайте его: POST /orders.`);
      if (!(Number(b.amount) > 0)) throw new HttpError(422, 'Unprocessable Content', 'Сумма платежа должна быть больше нуля.', { errors: [{ field: 'amount', message: '> 0' }] });
      const pay = { paymentId: `PAY-${this.seq.pay++}`, orderId: String(b.orderId), amount: Number(b.amount) };
      this.payments.push(pay);
      return this.ok(201, pay, [['Location', `/payments/${pay.paymentId}`]]);
    });
  }

  private patchEmployee(req: LabRequest, e: Employee) {
    const ifMatch = getHeader(req.headers, 'If-Match');
    if (!ifMatch) throw new HttpError(428, 'Precondition Required', 'Изменение — только условным запросом: передайте If-Match с ETag из GET /employees/{id}.');
    if (ifMatch.replace(/^W\//, '') !== `"v${e.version}"`)
      throw new HttpError(412, 'Precondition Failed', `Запись изменилась с момента чтения: ваш ETag ${ifMatch}, текущий "v${e.version}". Перечитайте запись и повторите изменение.`);
    const b = this.jsonBody(req, ['application/json', 'application/merge-patch+json']);
    const allowed = ['phone', 'department'];
    const bad = Object.keys(b).filter((k) => !allowed.includes(k));
    if (bad.length) throw new HttpError(422, 'Unprocessable Content', `Изменять можно только поля: ${allowed.join(', ')}.`, { errors: bad.map((f) => ({ field: f, message: 'поле нельзя изменять' })) });
    Object.assign(e, b);
    e.version++;
    const { version, ...view } = e;
    return this.ok(200, view, [['ETag', `"v${version}"`]]);
  }

  private rates() {
    const now = this.clock();
    if (!this.ratesTouched) {
      // первое обращение попадает в «закрытие дня»
      this.ratesTouched = true;
      this.ratesDownUntil = now + RATES_MAINTENANCE_MS;
    }
    if (now < this.ratesDownUntil) {
      const retry = Math.ceil((this.ratesDownUntil - now) / 1000);
      throw new HttpError(503, 'Service Unavailable', 'Идёт закрытие дня, курсы временно недоступны.', {}, [['Retry-After', String(retry)]]);
    }
    return this.ok(200, { date: new Date(now).toISOString().slice(0, 10), rates: { USD: 92.5, EUR: 99.8, CNY: 12.7 } });
  }
}

/** Справка по учебному API для вкладки «Учебный API». */
export const API_REFERENCE: { method: string; path: string; auth: string; note: string }[] = [
  { method: 'POST', path: '/auth/token', auth: '—', note: 'Токен по OAuth 2.0 client credentials. Тело — application/x-www-form-urlencoded: grant_type, client_id, client_secret' },
  { method: 'GET', path: '/branches', auth: 'read', note: 'Справочник филиалов АБС' },
  { method: 'GET', path: '/users', auth: 'read', note: 'Пользователи АБС' },
  { method: 'POST', path: '/users', auth: 'write', note: 'Создать пользователя: login, lastName, firstName, branchCode. Поддерживает Idempotency-Key' },
  { method: 'GET', path: '/users/{login}', auth: 'read', note: 'Пользователь по логину' },
  { method: 'GET', path: '/orders', auth: 'read', note: 'Заказы' },
  { method: 'POST', path: '/orders', auth: 'write', note: 'Создать заказ: customerId, items [{sku, quantity}]. Поддерживает Idempotency-Key' },
  { method: 'GET', path: '/payments', auth: 'read', note: 'Платежи' },
  { method: 'POST', path: '/payments', auth: 'payments:write', note: 'Платёж: orderId, amount. Не более 2 за 10 секунд на клиента. Поддерживает Idempotency-Key' },
  { method: 'GET', path: '/employees', auth: 'read', note: 'Сотрудники: ?department=retail|it&limit=1..100' },
  { method: 'GET', path: '/employees/{id}', auth: 'read', note: 'Сотрудник; в ответе ETag' },
  { method: 'PATCH', path: '/employees/{id}', auth: 'write', note: 'Изменить phone или department; обязателен If-Match' },
  { method: 'GET', path: '/exchange-rates', auth: 'read', note: 'Курсы валют; бывает «закрытие дня»' },
  { method: 'GET', path: '/reports/daily-sync', auth: 'read', note: 'Дневной отчёт синхронно — долгий' },
  { method: 'POST', path: '/reports', auth: 'read', note: 'Заказать отчёт асинхронно: {"type": "daily"} → 202 и Location' },
  { method: 'GET', path: '/reports/{id}', auth: 'read', note: 'Статус и результат асинхронного отчёта' },
];
