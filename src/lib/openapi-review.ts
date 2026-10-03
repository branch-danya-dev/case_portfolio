/**
 * Быстрый ревью-чек спецификации OpenAPI для аналитика (не полный валидатор):
 * сводка и типичные пробелы — нет описания операции, не описаны ошибки, нет аутентификации, битые $ref.
 */
export type Level = 'error' | 'warn' | 'info';
export interface Finding {
  level: Level;
  where: string;
  text: string;
}
export interface Review {
  version?: string;
  title?: string;
  paths: number;
  operations: number;
  byMethod: Record<string, number>;
  schemas: number;
  findings: Finding[];
  externalRefs: string[];
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function collectRefs(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => collectRefs(x, out));
  else if (isObj(v))
    for (const [k, x] of Object.entries(v)) {
      if (k === '$ref' && typeof x === 'string') out.push(x);
      else collectRefs(x, out);
    }
  return out;
}

/** Разрешить внутреннюю ссылку «#/components/schemas/X» (с экранированием ~1 и ~0). */
function resolvePointer(doc: unknown, ref: string): boolean {
  let cur: unknown = doc;
  for (const raw of ref.slice(2).split('/')) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObj(cur) && !Array.isArray(cur)) return false;
    cur = (cur as Obj)[key];
    if (cur === undefined) return false;
  }
  return true;
}

export function reviewOpenApi(doc: unknown): Review {
  const f: Finding[] = [];
  const r: Review = { paths: 0, operations: 0, byMethod: {}, schemas: 0, findings: f, externalRefs: [] };
  if (!isObj(doc)) {
    f.push({ level: 'error', where: 'документ', text: 'Это не объект — спецификация OpenAPI должна быть JSON- или YAML-объектом' });
    return r;
  }
  const version = typeof doc.openapi === 'string' ? doc.openapi : typeof doc.swagger === 'string' ? `Swagger ${doc.swagger}` : undefined;
  r.version = version;
  if (!version) f.push({ level: 'error', where: 'openapi', text: 'Нет поля openapi — это точно спецификация OpenAPI?' });
  else if (doc.swagger) f.push({ level: 'info', where: 'swagger', text: 'Swagger 2.0 — Redoc его покажет, но для новых контрактов используйте OpenAPI 3.x' });

  const info = isObj(doc.info) ? doc.info : undefined;
  r.title = typeof info?.title === 'string' ? info.title : undefined;
  if (!info?.title) f.push({ level: 'error', where: 'info.title', text: 'Нет названия API' });
  if (!info?.version) f.push({ level: 'error', where: 'info.version', text: 'Нет версии контракта' });
  if (info && !info.description) f.push({ level: 'info', where: 'info.description', text: 'Нет описания API — назначение, потребители, ссылки на требования' });
  if (!doc.servers && !doc.swagger) f.push({ level: 'info', where: 'servers', text: 'Не указаны серверы (окружения)' });

  const components = isObj(doc.components) ? doc.components : undefined;
  const schemas = isObj(components?.schemas) ? components.schemas : isObj(doc.definitions) ? doc.definitions : {};
  r.schemas = Object.keys(schemas).length;
  const hasGlobalSecurity = Array.isArray(doc.security) && doc.security.length > 0;
  const hasSchemes = isObj(components?.securitySchemes) && Object.keys(components.securitySchemes).length > 0;

  const paths = isObj(doc.paths) ? doc.paths : {};
  r.paths = Object.keys(paths).length;
  if (!r.paths && !doc.webhooks) f.push({ level: 'warn', where: 'paths', text: 'Нет ни одного пути' });

  let opsWithoutSecurity = 0;
  for (const [path, item] of Object.entries(paths)) {
    if (!isObj(item)) continue;
    for (const m of METHODS) {
      const op = item[m];
      if (!isObj(op)) continue;
      r.operations++;
      r.byMethod[m.toUpperCase()] = (r.byMethod[m.toUpperCase()] ?? 0) + 1;
      const where = `${m.toUpperCase()} ${path}`;
      if (!op.summary && !op.description) f.push({ level: 'warn', where, text: 'Нет summary / description — непонятно, что делает операция' });
      if (!op.operationId) f.push({ level: 'info', where, text: 'Нет operationId — по нему ссылаются в документации и генерируют код' });
      const responses = isObj(op.responses) ? Object.keys(op.responses) : [];
      if (!responses.length) f.push({ level: 'error', where, text: 'Не описаны ответы' });
      else if (!responses.some((c) => /^[45]/.test(c) || c === 'default'))
        f.push({ level: 'warn', where, text: 'Описан только успешный ответ — какие ошибки возможны (400, 404, 409, 422…)?' });
      if (!hasGlobalSecurity && !(Array.isArray(op.security) && op.security.length)) opsWithoutSecurity++;
      const params = [...(Array.isArray(item.parameters) ? item.parameters : []), ...(Array.isArray(op.parameters) ? op.parameters : [])];
      if (m === 'post' && !params.some((p) => isObj(p) && typeof p.name === 'string' && /idempotency/i.test(p.name)) && !collectRefs(params).some((x) => /idempoten/i.test(x)))
        f.push({ level: 'info', where, text: 'POST без ключа идемпотентности — что будет при повторе запроса после тайм-аута?' });
    }
  }
  if (r.operations && opsWithoutSecurity === r.operations) {
    const mtlsInText = typeof info?.description === 'string' && /mTLS|mutual TLS|взаимн\S* TLS/i.test(info.description);
    if (hasSchemes) f.push({ level: 'warn', where: 'security', text: 'Схемы безопасности объявлены, но не применены ни к одной операции' });
    else if (mtlsInText)
      f.push({ level: 'info', where: 'security', text: 'Аутентификация (mTLS) описана только текстом: в OpenAPI 3.0 для mTLS нет схемы, в 3.1 есть тип mutualTLS' });
    else f.push({ level: 'warn', where: 'security', text: 'Не описана аутентификация (securitySchemes, security)' });
  }

  const refs = collectRefs(doc);
  const external = [...new Set(refs.filter((x) => !x.startsWith('#')))];
  r.externalRefs = external;
  if (external.length)
    f.push({ level: 'warn', where: '$ref', text: `Внешние ссылки (${external.length}) — на этом офлайн-сайте они не загрузятся: ${external.slice(0, 3).join(', ')}${external.length > 3 ? '…' : ''}` });
  const broken = [...new Set(refs.filter((x) => x.startsWith('#/') && !resolvePointer(doc, x)))];
  for (const b of broken) f.push({ level: 'error', where: '$ref', text: `Ссылка никуда не ведёт: ${b}` });

  const order: Record<Level, number> = { error: 0, warn: 1, info: 2 };
  f.sort((a, b) => order[a.level] - order[b.level]);
  return r;
}
