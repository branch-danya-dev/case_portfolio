/**
 * Подсказки терминов (разметку создаёт src/plugins/remark-terms.mjs): при показе держим подсказку
 * в пределах окна — сдвигаем по горизонтали и открываем над словом, если снизу не хватает места.
 */
const MARGIN = 8;

function place(term: Element) {
  const tip = term.querySelector<HTMLElement>(':scope > .term__tip');
  if (!tip) return;
  tip.style.left = '';
  tip.classList.remove('is-above');
  requestAnimationFrame(() => {
    const r = tip.getBoundingClientRect();
    if (!r.width) return; // подсказка не показана
    let shift = 0;
    if (r.right > window.innerWidth - MARGIN) shift = window.innerWidth - MARGIN - r.right;
    if (r.left + shift < MARGIN) shift = MARGIN - r.left;
    if (shift) tip.style.left = `${shift}px`;
    if (r.bottom > window.innerHeight - MARGIN && r.top - r.height - term.getBoundingClientRect().height > MARGIN) tip.classList.add('is-above');
  });
}

export function initTerms() {
  const onShow = (e: Event) => {
    const term = (e.target as Element | null)?.closest?.('.term');
    if (term) place(term);
  };
  document.addEventListener('focusin', onShow);
  document.addEventListener('mouseover', onShow);
}
