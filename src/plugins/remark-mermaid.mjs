// Превращает блоки ```mermaid в <figure data-mermaid> до того, как их обработает Expressive Code.
// Рисует диаграмму клиентский скрипт src/scripts/mermaid.ts (mermaid из npm, без CDN).
// Пока JS не отработал (или отключён), виден исходный код диаграммы.
//
// Подпись: ```mermaid title="Жизненный цикл заявки"

const escapeHtml = (s) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function walk(node, fn) {
  if (!node.children) return;
  node.children.forEach((child, index) => {
    fn(child, index, node);
    walk(child, fn);
  });
}

export default function remarkMermaid() {
  return (tree) => {
    walk(tree, (node, index, parent) => {
      if (node.type !== 'code' || node.lang !== 'mermaid') return;
      const title = node.meta?.match(/title="([^"]*)"/)?.[1];
      const caption = title ? `<figcaption class="mermaid-caption">${escapeHtml(title)}</figcaption>` : '';
      parent.children[index] = {
        type: 'html',
        value:
          `<figure class="mermaid-figure not-content" data-mermaid${title ? ` aria-label="${escapeHtml(title)}"` : ''}>` +
          `<div class="mermaid-render" role="img" aria-label="${escapeHtml(title ?? 'Диаграмма')}"></div>` +
          `<div class="mermaid-code" translate="no" tabindex="0">${escapeHtml(node.value)}</div>` +
          `<div class="mermaid-toolbar"></div>` +
          caption +
          `</figure>`,
      };
    });
  };
}
