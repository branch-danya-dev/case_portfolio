// Расшифровка терминов для начинающих: первое упоминание каждого термина глоссария на странице
// получает всплывающую подсказку (наведение, фокус с клавиатуры, касание), а в конец страницы
// добавляется блок «Термины на этой странице». Источник определений — только src/data/glossary.yaml.
//
// Как термин ищется в тексте — поле match у термина (см. src/content.config.ts) плюс автоматически:
// аббревиатура в скобках в term («Бизнес-аналитик (БА)») и term из одного латинского слова / аббревиатуры («RACI»).
// Не трогаем: код, заголовки, ссылки, сырой HTML, компоненты-ссылки и просмотрщики (SKIP_COMPONENTS).
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import YAML from 'yaml';

/** Разделы, где подсказки не нужны: сам глоссарий, инструменты, шпаргалки (лимит — лист A4), главная. */
const SKIP_PAGES = [/^glossary(\/|$)/, /^tools(\/|$)/, /^cheatsheets(\/|$)/, /^interview\/questions(\/|$)/, /^$/, /^404$/];
const SKIP_NODES = new Set(['link', 'linkReference', 'inlineCode', 'code', 'heading', 'html', 'mdxTextExpression', 'mdxFlowExpression', 'termRef']);
const SKIP_COMPONENTS = new Set(['CaseRef', 'DownloadButton', 'Related', 'InterviewQuestions', 'PlantUmlDiagram', 'BpmnViewer', 'OpenApiViewer', 'AsyncApiViewer', 'PrintButton', 'Glossary', 'SoftwareCatalog', 'QuestionStats']);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isAbbr = (s) => /^[A-Za-zА-ЯЁа-яё0-9/.+-]+$/.test(s) && (/^[A-Za-z]/.test(s) || (s.match(/[A-ZА-ЯЁ]/g) ?? []).length >= 2);

/** Первое предложение определения — для подсказки и блока в конце страницы. */
function short(def) {
  const m = def.match(/^(.{25,}?[.!?])\s+[А-ЯЁA-Z«]/u);
  const s = (m ? m[1] : def).trim();
  return s.length > 240 ? s.slice(0, 237).replace(/\s+\S*$/, '') + '…' : s;
}

/**
 * Форма из match → регулярное выражение:
 *   «/…/»            — регулярное выражение как есть;
 *   «статусн* модел*» — «*» = любое окончание слова, без учёта регистра (склонения, словосочетания);
 *   «~Webhook»       — точное написание без учёта регистра;
 *   «БА»             — точное написание с учётом регистра (аббревиатуры).
 * Во всех случаях — не внутри слова и не часть ID вида FR-06 (их ловит запись case-ids).
 */
function compile(form) {
  if (form.startsWith('/') && form.endsWith('/') && form.length > 2) return new RegExp(form.slice(1, -1), 'u');
  const tail = '(?![\\p{L}\\d_]|-\\d)';
  if (form.includes('*')) return new RegExp(`(?<![\\p{L}\\d])${form.split('*').map(esc).join('\\p{L}*')}${tail}`, 'iu');
  if (form.startsWith('~')) return new RegExp(`(?<![\\p{L}\\d_/.-])${esc(form.slice(1))}${tail}`, 'iu');
  return new RegExp(`(?<![\\p{L}\\d_/.-])${esc(form)}${tail}`, 'u');
}

let cache;
function loadTerms() {
  if (cache) return cache;
  const list = YAML.parse(readFileSync(resolve('src/data/glossary.yaml'), 'utf8'));
  cache = list
    .map((e) => {
      const forms = new Set(e.match ?? []);
      const inParens = e.term.match(/\(([^)]+)\)\s*$/)?.[1];
      if (inParens && isAbbr(inParens)) forms.add(inParens);
      for (const part of e.term.split(/,\s*/)) {
        if (/\s/.test(part) || !isAbbr(part)) continue;
        // Латинское слово с заглавной (Webhook, Kafka, Scrum) в тексте бывает и со строчной
        forms.add(/^[A-Z][a-z]+$/.test(part) ? `~${part}` : part);
      }
      return { id: e.id, term: e.term, short: short(e.definition), regexes: [...forms].map(compile) };
    })
    .filter((e) => e.regexes.length);
  return cache;
}

function slugOf(file) {
  const p = file?.path ?? file?.history?.[0];
  if (!p) return null;
  return relative(resolve('src/content/docs'), p)
    .replaceAll('\\', '/')
    .replace(/\.(mdx?|markdown)$/, '')
    .replace(/(^|\/)index$/, '');
}

const text = (value) => ({ type: 'text', value });
const glossaryLink = (id, label, ariaLabel) => ({
  type: 'link',
  url: `/glossary/#${id}`,
  ...(ariaLabel ? { data: { hProperties: { ariaLabel } } } : {}),
  children: [text(label)],
});

function termNode(entry, matched) {
  return {
    type: 'termRef',
    data: { hName: 'span', hProperties: { className: ['term'], tabIndex: 0, ariaDescribedBy: `term-tip-${entry.id}` } },
    children: [
      text(matched),
      {
        type: 'termTip',
        data: { hName: 'span', hProperties: { className: ['term__tip'], role: 'tooltip', id: `term-tip-${entry.id}`, dataPagefindIgnore: '' } },
        children: [{ type: 'strong', children: [text(entry.term)] }, text(` — ${entry.short} `), glossaryLink(entry.id, 'Подробнее в глоссарии')],
      },
    ],
  };
}

export default function remarkTerms() {
  return (tree, file) => {
    const slug = slugOf(file);
    if (slug === null || SKIP_PAGES.some((r) => r.test(slug))) return;
    const terms = loadTerms();
    const used = [];
    const usedIds = new Set();

    const walk = (node) => {
      if (!node.children) return;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (SKIP_NODES.has(child.type)) continue;
        if ((child.type === 'mdxJsxFlowElement' || child.type === 'mdxJsxTextElement') && SKIP_COMPONENTS.has(child.name)) continue;
        if (child.type !== 'text') {
          walk(child);
          continue;
        }
        // Самое раннее совпадение среди ещё не отмеченных на странице терминов
        let best = null;
        for (const entry of terms) {
          if (usedIds.has(entry.id)) continue;
          for (const re of entry.regexes) {
            const m = re.exec(child.value);
            if (m && (best === null || m.index < best.index)) best = { entry, index: m.index, value: m[0] };
          }
        }
        if (!best) continue;
        usedIds.add(best.entry.id);
        used.push(best.entry);
        const before = child.value.slice(0, best.index);
        const after = child.value.slice(best.index + best.value.length);
        const replacement = [...(before ? [text(before)] : []), termNode(best.entry, best.value), ...(after ? [text(after)] : [])];
        node.children.splice(i, 1, ...replacement);
        // продолжаем с хвоста — в нём могут быть другие термины
        i += replacement.length - (after ? 2 : 1);
      }
    };
    walk(tree);

    if (!used.length) return;
    tree.children.push(
      { type: 'heading', depth: 2, children: [text('Термины на этой странице')] },
      {
        type: 'pageTerms',
        data: { hName: 'div', hProperties: { className: ['page-terms'], dataPagefindIgnore: '' } },
        children: [
          {
            type: 'list',
            ordered: false,
            spread: false,
            children: used.map((e) => ({
              type: 'listItem',
              spread: false,
              children: [{ type: 'paragraph', children: [{ type: 'strong', children: [text(e.term)] }, text(` — ${e.short} `), glossaryLink(e.id, '→', `${e.term} — в глоссарии`)] }],
            })),
          },
        ],
      },
    );
  };
}
