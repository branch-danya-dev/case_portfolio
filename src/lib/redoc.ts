/**
 * Ленивая загрузка Redoc (standalone-бандл из public/vendor/redoc, копируется scripts/vendor-assets.mjs).
 * Бандл содержит свой React, поэтому подключается тегом <script>, а не импортом — так он не конфликтует с React сайта.
 */
declare global {
  interface Window {
    Redoc?: {
      init(spec: string | object, options: Record<string, unknown>, element: HTMLElement, callback?: (e?: unknown) => void): void;
    };
  }
}

let loading: Promise<NonNullable<Window['Redoc']>> | undefined;

export function loadRedoc() {
  loading ??= new Promise((resolve, reject) => {
    if (window.Redoc) return resolve(window.Redoc);
    const s = document.createElement('script');
    s.src = '/vendor/redoc/redoc.standalone.js';
    s.onload = () => (window.Redoc ? resolve(window.Redoc) : reject(new Error('Redoc не инициализировался')));
    s.onerror = () => reject(new Error('не удалось загрузить /vendor/redoc/redoc.standalone.js'));
    document.head.append(s);
  });
  return loading;
}

/** Общие настройки Redoc: шрифты и акцент сайта, без сетевых запросов. */
export const redocOptions = {
  nativeScrollbars: true,
  hideHostname: false,
  expandResponses: '200,201',
  jsonSampleExpandLevel: 3,
  pathInMiddlePanel: true,
  scrollYOffset: 'header.header',
  theme: {
    colors: { primary: { main: '#115e59' } },
    typography: {
      fontFamily: "'Inter Variable', system-ui, sans-serif",
      fontSize: '15px',
      headings: { fontFamily: "'Inter Variable', system-ui, sans-serif", fontWeight: '600' },
      code: { fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace" },
    },
    sidebar: { width: '240px' },
    rightPanel: { backgroundColor: '#1f2937' },
  },
};

export async function renderRedoc(spec: string | object, element: HTMLElement) {
  const Redoc = await loadRedoc();
  await new Promise<void>((resolve, reject) =>
    Redoc.init(spec, redocOptions, element, (e) => (e ? reject(e) : resolve())),
  );
}
