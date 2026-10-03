/**
 * Доступность с клавиатуры: широкие таблицы статей прокручиваются по горизонтали (custom.css),
 * и прокрутить их можно только мышью. Таблице, которая не помещается, даём tabindex=0 —
 * её можно выбрать клавишей Tab и прокрутить стрелками (WCAG 2.1.1, правило axe scrollable-region-focusable).
 */
export function initA11y() {
  const update = () => {
    document.querySelectorAll<HTMLTableElement>('.sl-markdown-content table').forEach((t) => {
      const scrollable = t.scrollWidth > t.clientWidth + 1;
      if (scrollable && !t.hasAttribute('tabindex')) {
        t.tabIndex = 0;
        t.dataset.saScroll = '1';
      } else if (!scrollable && t.dataset.saScroll) {
        t.removeAttribute('tabindex');
        delete t.dataset.saScroll;
      }
    });
  };
  update();
  let timer: number | undefined;
  window.addEventListener('resize', () => {
    clearTimeout(timer);
    timer = window.setTimeout(update, 200);
  });
}
