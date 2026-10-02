import {
  MERMAID_SANDBOX_PATH,
  MERMAID_SANDBOX_READY,
  copyText,
  downloadText,
  encodeCode,
} from '../lib/share';

/**
 * Рисует все <figure data-mermaid> на странице (их создаёт src/plugins/remark-mermaid.mjs).
 * mermaid подгружается лениво и только там, где есть диаграммы. Пакет бандлится Vite из npm.
 * При смене темы диаграммы перерисовываются.
 */
export function initMermaid() {
  const figures = [...document.querySelectorAll<HTMLElement>('figure[data-mermaid]')];
  if (!figures.length) return;

  figures.forEach((figure, i) => addToolbar(figure, i));

  let mermaidPromise: Promise<typeof import('mermaid').default> | undefined;
  const getMermaid = () => (mermaidPromise ??= import('mermaid').then((m) => m.default));

  let renderSeq = 0;
  const renderAll = async () => {
    const seq = ++renderSeq;
    const mermaid = await getMermaid();
    const dark = document.documentElement.dataset.theme !== 'light';
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default',
      fontFamily: getComputedStyle(document.body).fontFamily,
    });
    for (const [i, figure] of figures.entries()) {
      if (seq !== renderSeq) return; // тема переключилась ещё раз — этот проход устарел
      // Внутри закрытого <details> размеры элементов нулевые — mermaid нарисует криво.
      // Такие диаграммы рисуются при раскрытии блока (см. обработчик toggle ниже).
      if (figure.closest('details:not([open])')) continue;
      const code = figure.querySelector('.mermaid-code')?.textContent ?? '';
      const target = figure.querySelector<HTMLElement>('.mermaid-render')!;
      try {
        const { svg } = await mermaid.render(`mermaid-${i}-${seq}`, code);
        target.innerHTML = svg;
        figure.classList.add('is-rendered');
      } catch (error) {
        target.innerHTML = '';
        const p = document.createElement('p');
        p.className = 'mermaid-error';
        p.textContent = `Не удалось отрисовать диаграмму: ${(error as Error).message ?? error}`;
        target.append(p);
        figure.classList.remove('is-rendered');
      }
    }
  };

  // Рендерим, когда диаграмма подходит к экрану: длинные страницы не тормозят при загрузке.
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        renderAll();
      }
    },
    { rootMargin: '400px' },
  );
  figures.forEach((f) => io.observe(f));

  new MutationObserver(() => {
    if (mermaidPromise) renderAll();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  window.addEventListener('beforeprint', () => {
    if (!mermaidPromise) renderAll();
  });

  // Раскрыли <details> с диаграммами (решение упражнения) — перерисовываем
  document.querySelectorAll('details').forEach((d) => {
    if (!d.querySelector('figure[data-mermaid]')) return;
    d.addEventListener('toggle', () => {
      if (d.open) renderAll();
    });
  });
}

function addToolbar(figure: HTMLElement, index: number) {
  const toolbar = figure.querySelector<HTMLElement>('.mermaid-toolbar');
  if (!toolbar) return;
  const code = () => figure.querySelector('.mermaid-code')?.textContent ?? '';

  const button = (label: string, onClick: (b: HTMLButtonElement) => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sa-btn';
    b.textContent = label;
    b.addEventListener('click', () => onClick(b));
    toolbar.append(b);
    return b;
  };

  button('Код', (b) => {
    const shown = figure.classList.toggle('show-code');
    b.setAttribute('aria-pressed', String(shown));
  }).setAttribute('aria-pressed', 'false');

  button('Копировать код', async (b) => {
    const ok = await copyText(code());
    flash(b, ok ? 'Скопировано' : 'Не удалось');
  });

  button('Скачать SVG', () => {
    const svg = figure.querySelector('.mermaid-render svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    downloadText(`diagram-${index + 1}.svg`, xml, 'image/svg+xml');
  });

  if (MERMAID_SANDBOX_READY) {
    const a = document.createElement('a');
    a.className = 'sa-btn sa-btn--primary';
    a.textContent = 'Открыть в песочнице';
    a.href = `${MERMAID_SANDBOX_PATH}#code=${encodeCode(code())}`;
    toolbar.append(a);
  }
}

function flash(button: HTMLButtonElement, text: string) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => (button.textContent = original), 1500);
}
