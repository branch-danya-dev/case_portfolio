/**
 * API Lab: модель HTTP-сообщений, разбор сырого HTTP и curl, сборка обратно.
 * Всё выполняется в браузере; запросы обрабатывает встроенный учебный сервер (mock.ts), сеть не используется.
 */
import { STATUSES } from '../../data/http';

export type Header = [name: string, value: string];
export interface LabRequest {
  method: string;
  url: string;
  headers: Header[];
  body: string;
}
export interface LabResponse {
  status: number;
  headers: Header[];
  body: string;
  latencyMs: number;
  /** Сервер не ответил за время ожидания клиента. */
  timeout?: boolean;
}
export type ParseResult = { ok: true; req: LabRequest } | { ok: false; error: string };

export const DEFAULT_HOST = 'api.lab.local';
export const CLIENT_TIMEOUT_MS = 3000;

const EXTRA_REASONS: Record<number, string> = { 405: 'Method Not Allowed', 406: 'Not Acceptable' };
export const reason = (code: number) => STATUSES.find((s) => s.code === code)?.name ?? EXTRA_REASONS[code] ?? '';

export const getHeader = (headers: Header[], name: string) => headers.find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1];

/** Путь и параметры из URL; хост любой — маршрутизация только по пути. */
export function splitUrl(url: string): { host: string; path: string; query: URLSearchParams } {
  const withScheme = /^[a-z]+:\/\//i.test(url) ? url : `http://${DEFAULT_HOST}${url.startsWith('/') ? '' : '/'}${url}`;
  const u = new URL(withScheme);
  return { host: u.host, path: decodeURIComponent(u.pathname).replace(/\/+$/, '') || '/', query: u.searchParams };
}

// ---------- сырой HTTP ----------

/** Разбор сырого запроса: «МЕТОД путь [HTTP/1.1]», заголовки, пустая строка, тело. */
export function parseRaw(text: string): ParseResult {
  const src = text.replace(/\r\n/g, '\n').replace(/^\s*\n/, '');
  if (!src.trim()) return { ok: false, error: 'Пустой запрос' };
  const [head, ...rest] = src.split(/\n\s*\n/);
  const body = rest.join('\n\n');
  const lines = head.split('\n');
  const start = lines[0].trim().match(/^([A-Za-z]+)\s+(\S+)(?:\s+HTTP\/[\d.]+)?$/);
  if (!start) return { ok: false, error: `Строка 1: ожидалось «МЕТОД путь HTTP/1.1», получено «${lines[0].trim()}»` };
  const headers: Header[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = line.match(/^([^:\s]+)\s*:\s*(.*)$/);
    if (!m) return { ok: false, error: `Строка ${i + 1}: заголовок должен иметь вид «Имя: значение» — «${line.trim()}». Тело отделяется пустой строкой` };
    headers.push([m[1], m[2].trim()]);
  }
  let url = start[2];
  const host = getHeader(headers, 'Host');
  if (url.startsWith('/') && host) url = `https://${host}${url}`;
  return { ok: true, req: { method: start[1].toUpperCase(), url, headers, body: body.replace(/\s+$/, '') } };
}

export function toRaw(req: LabRequest): string {
  const { host, path, query } = splitUrl(req.url);
  const q = query.toString();
  const lines = [`${req.method} ${path}${q ? `?${q}` : ''} HTTP/1.1`, `Host: ${host}`];
  for (const [n, v] of req.headers) if (n.toLowerCase() !== 'host') lines.push(`${n}: ${v}`);
  return lines.join('\n') + '\n' + (req.body ? `\n${req.body}` : '');
}

export function rawResponse(res: LabResponse): string {
  if (res.timeout) return `(ответа нет: сервер не ответил за ${CLIENT_TIMEOUT_MS / 1000} с — тайм-аут клиента)`;
  const lines = [`HTTP/1.1 ${res.status} ${reason(res.status)}`, ...res.headers.map(([n, v]) => `${n}: ${v}`)];
  return lines.join('\n') + '\n' + (res.body ? `\n${res.body}` : '');
}

// ---------- curl ----------

/** Разбить командную строку на аргументы: кавычки '…' и "…", перенос строки через «\» или «^». */
function shellSplit(text: string): string[] | string {
  const s = text.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
  const args: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === '\\' && quote === '"' && (s[i + 1] === '"' || s[i + 1] === '\\')) cur += s[++i];
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      has = true;
    } else if (/\s/.test(c)) {
      if (has || cur) args.push(cur);
      cur = '';
      has = false;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[++i];
      has = true;
    } else {
      cur += c;
      has = true;
    }
  }
  if (quote) return `Не закрыта кавычка ${quote}`;
  if (has || cur) args.push(cur);
  return args;
}

/** Разбор curl: -X, -H, -d/--data/--data-raw/--data-binary, --json, -u, -I, URL. Остальные флаги — с предупреждением. */
export function parseCurl(text: string): ParseResult & { warnings?: string[] } {
  const args = shellSplit(text.trim());
  if (typeof args === 'string') return { ok: false, error: args };
  if (!args.length || args[0] !== 'curl') return { ok: false, error: 'Команда должна начинаться с curl' };
  let method: string | null = null;
  let url = '';
  const headers: Header[] = [];
  const data: string[] = [];
  const warnings: string[] = [];
  let json = false;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    const next = () => {
      if (i + 1 >= args.length) throw new Error(`После ${a} нужно значение`);
      return args[++i];
    };
    try {
      if (a === '-X' || a === '--request') method = next().toUpperCase();
      else if (a === '-H' || a === '--header') {
        const h = next();
        const m = h.match(/^([^:]+):\s*(.*)$/);
        if (!m) return { ok: false, error: `Заголовок «${h}» должен иметь вид «Имя: значение»` };
        headers.push([m[1].trim(), m[2]]);
      } else if (['-d', '--data', '--data-raw', '--data-binary', '--data-ascii'].includes(a)) data.push(next());
      else if (a === '--json') {
        data.push(next());
        json = true;
      } else if (a === '-u' || a === '--user') headers.push(['Authorization', `Basic ${btoa(unescape(encodeURIComponent(next())))}`]);
      else if (a === '-I' || a === '--head') method = 'HEAD';
      else if (a === '--url') url = next();
      else if (['-i', '-v', '-s', '-S', '-k', '-L', '--silent', '--verbose', '--include', '--insecure', '--location', '--compressed'].includes(a)) {
        /* флаги вывода и соединения на учебный сервер не влияют */
      } else if (a.startsWith('-')) warnings.push(`Флаг ${a} не поддерживается и пропущен`);
      else if (!url) url = a;
      else warnings.push(`Лишний аргумент «${a}» пропущен`);
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  if (!url) return { ok: false, error: 'Не указан URL' };
  const body = data.join('&');
  if (json) {
    if (!getHeader(headers, 'Content-Type')) headers.push(['Content-Type', 'application/json']);
    if (!getHeader(headers, 'Accept')) headers.push(['Accept', 'application/json']);
  } else if (data.length && !getHeader(headers, 'Content-Type')) {
    // так ведёт себя настоящий curl: с -d и без -H Content-Type он отправляет form-urlencoded
    headers.push(['Content-Type', 'application/x-www-form-urlencoded']);
    warnings.push('С -d curl сам ставит Content-Type: application/x-www-form-urlencoded — для JSON укажите заголовок явно или используйте --json');
  }
  return { ok: true, req: { method: method ?? (data.length ? 'POST' : 'GET'), url, headers, body }, warnings };
}

export function toCurl(req: LabRequest): string {
  const q = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
  const parts = [`curl -X ${req.method} ${q(req.url.startsWith('/') ? `https://${DEFAULT_HOST}${req.url}` : req.url)}`];
  for (const [n, v] of req.headers) parts.push(`-H ${q(`${n}: ${v}`)}`);
  if (req.body) parts.push(`-d ${q(req.body)}`);
  return parts.join(' \\\n  ');
}
