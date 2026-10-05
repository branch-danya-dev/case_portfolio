/**
 * Обёртка над localStorage. Все данные сайта хранятся только в браузере, ключи — с префиксом "sa:".
 * В приватном режиме или при запрете хранилища методы молча возвращают значение по умолчанию.
 */
const PREFIX = 'sa:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('sa-storage', { detail: { key } }));
  } catch {
    /* хранилище недоступно — работаем без сохранения */
  }
}

/** Ключ, под которым хранится список изученных страниц (слаги без слэшей по краям). */
export const STUDIED_KEY = 'studied';

export function normalizeSlug(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}

/** Страницы, переехавшие в другой раздел: старый адрес → новый (сохраняет отметки «Изучено»). */
const RENAMED: Record<string, string> = {
  'integrations/security-oauth': 'security/oauth',
  'integrations/mtls-sso': 'security/mtls-sso',
};

export function getStudied(): string[] {
  return [...new Set(load<string[]>(STUDIED_KEY, []).map((s) => RENAMED[s] ?? s))];
}

export function setStudied(slug: string, value: boolean): void {
  const set = new Set(getStudied());
  if (value) set.add(slug);
  else set.delete(slug);
  save(STUDIED_KEY, [...set].sort());
}
