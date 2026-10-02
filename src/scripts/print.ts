/** Перед печатью раскрывает все <details> (ответы на вопросы, исходники), после — возвращает как было. */
export function initPrint() {
  let opened: HTMLDetailsElement[] = [];
  window.addEventListener('beforeprint', () => {
    opened = [...document.querySelectorAll<HTMLDetailsElement>('details:not([open])')];
    opened.forEach((d) => (d.open = true));
  });
  window.addEventListener('afterprint', () => {
    opened.forEach((d) => (d.open = false));
    opened = [];
  });
}
