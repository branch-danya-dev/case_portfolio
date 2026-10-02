// Переводит темы из planned={[…]} в pages={[…]} у компонента <Related>, когда страница появилась.
// Запуск: node scripts/promote-related.mjs "Название из planned=slug" ["Название=slug" …]
// Пример: node scripts/promote-related.mjs "Паттерны надёжности=integrations/reliability"
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const map = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const i = arg.lastIndexOf('=');
    return [arg.slice(0, i), arg.slice(i + 1)];
  }),
);

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

const parseList = (s) => [...s.matchAll(/'([^']*)'/g)].map((m) => m[1]);
const fmt = (list) => `[${list.map((x) => `'${x}'`).join(', ')}]`;

let changed = 0;
for (const file of walk('src/content/docs').filter((f) => f.endsWith('.mdx'))) {
  const text = readFileSync(file, 'utf8');
  const next = text.replace(/<Related([\s\S]*?)\/>/g, (whole, attrs) => {
    const plannedMatch = attrs.match(/planned=\{(\[[\s\S]*?\])\}/);
    if (!plannedMatch) return whole;
    const planned = parseList(plannedMatch[1]);
    const promote = planned.filter((t) => map[t]);
    if (!promote.length) return whole;
    const pagesMatch = attrs.match(/pages=\{(\[[\s\S]*?\])\}/);
    const pages = pagesMatch ? parseList(pagesMatch[1]) : [];
    const self = file.split(/[\\/]/).join('/').replace(/^src\/content\/docs\//, '').replace(/\.mdx$/, '');
    for (const t of promote) if (!pages.includes(map[t]) && map[t] !== self) pages.push(map[t]);
    const rest = planned.filter((t) => !map[t]);
    return `<Related pages={${fmt(pages)}}${rest.length ? ` planned={${fmt(rest)}}` : ''} />`;
  });
  if (next !== text) {
    writeFileSync(file, next);
    changed++;
    console.log(`обновлено: ${file}`);
  }
}
console.log(`[promote-related] файлов изменено: ${changed}`);
