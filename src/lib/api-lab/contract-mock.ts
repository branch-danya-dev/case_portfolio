/**
 * Мок по контракту OpenAPI 3.x для API Lab (идея как у Prism): находит операцию по методу и пути,
 * проверяет Content-Type и тело по схеме (ajv), отвечает примером из контракта или значением по схеме.
 * Заголовок «Prefer: code=404» выбирает описанный в контракте ответ с этим кодом.
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ruError } from '../ajv-ru';
import { getHeader, splitUrl, type Header, type LabRequest, type LabResponse } from './http';

type Obj = Record<string, any>;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const json = (v: unknown) => JSON.stringify(v, null, 2);

function resolve(doc: Obj, node: any): any {
  let cur = node;
  for (let i = 0; i < 20 && cur && typeof cur === 'object' && typeof cur.$ref === 'string' && cur.$ref.startsWith('#/'); i++) {
    cur = cur.$ref
      .slice(2)
      .split('/')
      .reduce((o: any, k: string) => o?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], doc);
  }
  return cur;
}

/** Пример значения по схеме: example → default → enum → по типу. */
function sample(doc: Obj, schema: any, depth = 0): unknown {
  const s = resolve(doc, schema) ?? {};
  if (depth > 6) return null;
  if (s.example !== undefined) return s.example;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum)) return s.enum[0];
  if (s.allOf) return Object.assign({}, ...s.allOf.map((x: any) => sample(doc, x, depth + 1)));
  if (s.oneOf || s.anyOf) return sample(doc, (s.oneOf ?? s.anyOf)[0], depth + 1);
  switch (s.type) {
    case 'object':
    case undefined:
      if (!s.properties) return s.type === 'object' ? {} : null;
      return Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, sample(doc, v, depth + 1)]));
    case 'array':
      return [sample(doc, s.items, depth + 1)];
    case 'integer':
    case 'number':
      return s.minimum ?? 0;
    case 'boolean':
      return true;
    case 'string':
      if (s.format === 'date-time') return '2027-06-14T09:00:00Z';
      if (s.format === 'date') return '2027-06-14';
      if (s.format === 'uuid') return '3f6c2a5e-8b1d-4c1e-9a77-0c2b9d1e4f10';
      if (s.format === 'email') return 'user@bank.local';
      return 'string';
    default:
      return null;
  }
}

function exampleOf(doc: Obj, media: Obj | undefined): unknown {
  if (!media) return undefined;
  if (media.example !== undefined) return media.example;
  if (media.examples) {
    const first = resolve(doc, Object.values(media.examples)[0]);
    if (first?.value !== undefined) return first.value;
  }
  return media.schema ? sample(doc, media.schema) : undefined;
}

/** /access-requests/{requestId} → ^/access-requests/[^/]+$ */
function templateRe(tpl: string): RegExp {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${tpl.split('/').map((seg) => (/^\{[^}]+\}$/.test(seg) ? '[^/]+' : esc(seg))).join('/')}$`);
}

export interface ContractOp {
  method: string;
  path: string;
  summary?: string;
}

export class ContractMock {
  private ajv = new Ajv({ allErrors: true, strict: false });
  ops: ContractOp[] = [];
  constructor(private doc: Obj) {
    addFormats(this.ajv);
    for (const [path, item] of Object.entries<Obj>(doc.paths ?? {}))
      for (const m of METHODS) if (item?.[m]) this.ops.push({ method: m.toUpperCase(), path, summary: item[m].summary });
  }

  /** Пример запроса к операции: путь с примерами параметров, обязательные заголовки, тело из примера или схемы. */
  exampleRequest(method: string, path: string): LabRequest {
    const item = this.doc.paths?.[path] ?? {};
    const op = item[method.toLowerCase()] ?? {};
    const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map((x: any) => resolve(this.doc, x));
    const base = String(this.doc.servers?.[0]?.url ?? 'https://api.lab.local').replace(/\/$/, '');
    let url = base + path.replace(/\{([^}]+)\}/g, (_, name) => {
      const prm = params.find((x: any) => x?.in === 'path' && x.name === name);
      return encodeURIComponent(String(prm?.example ?? sample(this.doc, prm?.schema ?? { type: 'string' })));
    });
    const q = params.filter((x: any) => x?.in === 'query' && x.required).map((x: any) => `${x.name}=${encodeURIComponent(String(x.example ?? sample(this.doc, x.schema)))}`);
    if (q.length) url += `?${q.join('&')}`;
    const headers: Header[] = params
      .filter((x: any) => x?.in === 'header' && x.required)
      .map((x: any) => [x.name, String(x.example ?? (/idempotency/i.test(x.name) ? 'key-001' : sample(this.doc, x.schema)))] as Header);
    let body = '';
    const rb = resolve(this.doc, op.requestBody);
    const [ct, media] = Object.entries<Obj>(rb?.content ?? {})[0] ?? [];
    if (ct) {
      headers.push(['Content-Type', ct]);
      const v = exampleOf(this.doc, media);
      body = v === undefined ? '' : typeof v === 'string' ? v : json(v);
    }
    return { method: method.toUpperCase(), url, headers, body };
  }

  private problem(status: number, title: string, detail: string, extra: Obj = {}, headers: Header[] = []): LabResponse {
    return { status, headers: [['Content-Type', 'application/problem+json'], ['X-Mock', 'contract'], ...headers], body: json({ title, status, detail, ...extra }), latencyMs: 12 };
  }

  handle(req: LabRequest): LabResponse & { route: string } {
    const { path } = splitUrl(req.url);
    const prefixes = (this.doc.servers ?? []).map((s: Obj) => {
      try {
        return new URL(String(s.url), 'http://x').pathname.replace(/\/$/, '');
      } catch {
        return '';
      }
    });
    const p = prefixes.reduce((acc: string, pre: string) => (pre && acc.startsWith(pre) ? acc.slice(pre.length) || '/' : acc), path);
    const match = Object.keys(this.doc.paths ?? {}).find((tpl) => templateRe(tpl).test(p));
    if (!match) return { ...this.problem(404, 'Not Found', `В контракте нет пути, соответствующего ${p}. Описанные пути: ${Object.keys(this.doc.paths ?? {}).join(', ') || 'нет'}.`), route: `${req.method} ${p}` };
    const item = this.doc.paths[match];
    const op = item[req.method.toLowerCase()];
    const route = `${req.method} ${match}`;
    if (!op) {
      const allow = METHODS.filter((m) => item[m]).map((m) => m.toUpperCase()).join(', ');
      return { ...this.problem(405, 'Method Not Allowed', `Для ${match} в контракте нет метода ${req.method}.`, {}, [['Allow', allow]]), route };
    }

    // Обязательные параметры заголовка и запроса
    const { query } = splitUrl(req.url);
    const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map((x: any) => resolve(this.doc, x));
    const missing = params.filter((x: any) => x?.required && ((x.in === 'header' && !getHeader(req.headers, x.name)) || (x.in === 'query' && !query.has(x.name))));
    if (missing.length)
      return { ...this.problem(400, 'Bad Request', `Не переданы обязательные параметры: ${missing.map((x: any) => `${x.name} (${x.in})`).join(', ')}.`), route };

    // Тело запроса
    const rb = resolve(this.doc, op.requestBody);
    if (rb?.content) {
      const ct = (getHeader(req.headers, 'Content-Type') ?? '').split(';')[0].trim().toLowerCase();
      const media = rb.content[ct];
      if (!req.body.trim() && rb.required) return { ...this.problem(400, 'Bad Request', 'Контракт требует тело запроса.'), route };
      if (req.body.trim()) {
        if (!media) return { ...this.problem(415, 'Unsupported Media Type', `Контракт принимает: ${Object.keys(rb.content).join(', ')}; получено «${ct || 'не указан'}».`), route };
        if (ct.includes('json')) {
          let data: unknown;
          try {
            data = JSON.parse(req.body);
          } catch (e) {
            return { ...this.problem(400, 'Bad Request', `Тело не является корректным JSON: ${(e as Error).message}`), route };
          }
          if (media.schema) {
            const validate = this.ajv.compile({ ...resolve(this.doc, media.schema), components: this.doc.components });
            if (!validate(data))
              return {
                ...this.problem(400, 'Bad Request', 'Тело не соответствует схеме контракта.', {
                  errors: (validate.errors ?? []).map((e) => ({ field: e.instancePath || '(корень)', message: ruError(e) })),
                }),
                route,
              };
          }
        }
      }
    }

    // Ответ: Prefer: code=NNN или первый 2xx
    const responses: Obj = op.responses ?? {};
    const prefer = getHeader(req.headers, 'Prefer')?.match(/code=(\d{3})/)?.[1];
    const code = prefer && responses[prefer] ? prefer : Object.keys(responses).find((c) => /^2\d\d$/.test(c)) ?? Object.keys(responses)[0];
    if (!code) return { ...this.problem(500, 'Internal Server Error', 'В контракте у операции нет ни одного ответа.'), route };
    const resp = resolve(this.doc, responses[code]) ?? {};
    const [mediaType, media] = Object.entries<Obj>(resp.content ?? {})[0] ?? [];
    const value = exampleOf(this.doc, media);
    const headers: Header[] = [['X-Mock', 'contract']];
    if (mediaType) headers.unshift(['Content-Type', mediaType]);
    for (const [h, def] of Object.entries<Obj>(resp.headers ?? {})) {
      const d = resolve(this.doc, def);
      headers.push([h, String(d?.example ?? d?.schema?.example ?? sample(this.doc, d?.schema ?? { type: 'string' }))]);
    }
    return {
      status: code === 'default' ? 500 : Number(code),
      headers,
      body: value === undefined ? '' : typeof value === 'string' && !mediaType?.includes('json') ? value : json(value),
      latencyMs: 12,
      route,
    };
  }
}

/** Стартовый контракт редактора: contract-first для заявки на доступ (по мотивам API IdM кейса). */
export const STARTER_CONTRACT = `openapi: 3.0.3
info:
  title: API заявок на доступ (учебный)
  version: 0.1.0
  description: |
    Черновик контракта: сначала контракт, потом мок, клиент и тесты.
    Попробуйте добавить поле в схему CreateAccessRequest или ответ 409 —
    мок сразу начнёт работать по новому контракту.
servers:
  - url: https://api.lab.local/v1
paths:
  /access-requests:
    post:
      summary: Создать заявку на дополнительный доступ
      operationId: createAccessRequest
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          schema:
            type: string
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreateAccessRequest'
      responses:
        '201':
          description: Заявка создана
          headers:
            Location:
              schema:
                type: string
                example: /v1/access-requests/9a1e7c3b-2d44-4f0a-8e61-5b3c7d2a9e01
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AccessRequest'
        '400':
          description: Ошибка в запросе
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'
        '422':
          description: Нарушено бизнес-правило (например, SoD-конфликт)
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'
              example:
                title: Unprocessable Content
                status: 422
                detail: Полномочие ABS-CTRL конфликтует с ABS-OPER (SOD-01)
  /access-requests/{requestId}:
    get:
      summary: Получить заявку
      operationId: getAccessRequest
      parameters:
        - name: requestId
          in: path
          required: true
          schema:
            type: string
            format: uuid
      responses:
        '200':
          description: Заявка
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AccessRequest'
        '404':
          description: Заявки нет
          content:
            application/problem+json:
              schema:
                $ref: '#/components/schemas/Problem'
              example:
                title: Not Found
                status: 404
                detail: Заявки нет
components:
  schemas:
    CreateAccessRequest:
      type: object
      additionalProperties: false
      required: [employeeNumber, items, justification]
      properties:
        employeeNumber:
          type: string
          pattern: '^[0-9]{6}$'
          example: '004318'
        items:
          type: array
          minItems: 1
          items:
            type: object
            required: [entitlementId]
            properties:
              entitlementId:
                type: string
                example: VPN
        justification:
          type: string
          minLength: 10
          example: Работа из дома по графику дежурств
    AccessRequest:
      type: object
      required: [requestId, status]
      properties:
        requestId:
          type: string
          format: uuid
          example: 9a1e7c3b-2d44-4f0a-8e61-5b3c7d2a9e01
        status:
          type: string
          enum: [DRAFT, ON_APPROVAL, APPROVED, REJECTED, PROVISIONING, COMPLETED, PARTIALLY_COMPLETED, CANCELLED]
          example: ON_APPROVAL
        employeeNumber:
          type: string
          example: '004318'
    Problem:
      type: object
      properties:
        title:
          type: string
        status:
          type: integer
        detail:
          type: string
`;
