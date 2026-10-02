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

export function getStudied(): string[] {
  return load<string[]>(STUDIED_KEY, []);
}

export function setStudied(slug: string, value: boolean): void {
  const set = new Set(getStudied());
  if (value) set.add(slug);
  else set.delete(slug);
  save(STUDIED_KEY, [...set].sort());
}
