import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

/**
 * Код диаграммы передаётся в песочницу через фрагмент URL (#code=…): сжатие deflate + base64url.
 * Фрагмент не уходит на сервер, поэтому это работает офлайн и ничего никуда не отправляет.
 */
export function encodeCode(code: string): string {
  const bytes = deflateSync(strToU8(code), { level: 9 });
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCode(encoded: string): string {
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return strFromU8(inflateSync(bytes));
}

/** Путь песочницы Mermaid (инструмент 2). */
export const MERMAID_SANDBOX_PATH = '/tools/mermaid-sandbox/';

/** Показывать ли у диаграмм кнопку «Открыть в песочнице». */
export const MERMAID_SANDBOX_READY = true;

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Запасной путь для браузеров без Clipboard API (например, по file:// или без HTTPS)
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
