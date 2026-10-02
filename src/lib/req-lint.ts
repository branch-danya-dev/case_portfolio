/**
 * Линтер требований (инструмент tools/requirements-linter): эвристики по свойствам хорошего требования
 * (однозначность, проверяемость, атомарность, полнота). Это подсказки для ревью, а не вердикт.
 */
import { VAGUE_WORDS } from './vague-words';

export type Severity = 'error' | 'warn' | 'info';
export interface Issue {
  rule: string;
  severity: Severity;
  message: string;
  hint: string;
  /** Регулярное выражение для подсветки найденного фрагмента (флаги 'giu'). */
  pattern?: string;
}
export interface LintedRequirement {
  id?: string;
  text: string;
  issues: Issue[];
}

const L = '(?<!\\p{L})';
const R = '(?!\\p{L})';
const MODAL = `${L}(долж(ен|на|но|ны)|обязан[аоы]?)${R}`;

interface PatternRule {
  rule: string;
  severity: Severity;
  pattern: string;
  message: string;
  hint: string;
}

/** Правила «нашли фрагмент — замечание». */
export const PATTERN_RULES: PatternRule[] = [
  ...VAGUE_WORDS.map((v) => ({
    rule: 'vague',
    severity: 'warn' as const,
    pattern: v.pattern,
    message: `Размыто: «${v.word}»`,
    hint: v.hint,
  })),
  {
    rule: 'weak-modal',
    severity: 'warn',
    pattern: `${L}(может|могут|могла бы|желательно|рекомендуется|следует|предполагается|планируется)${R}`,
    message: 'Слабая модальность — обязательно это или нет?',
    hint: 'Обязательное — «должна»; необязательное — приоритет S / C по MoSCoW',
  },
  {
    rule: 'open-end',
    severity: 'error',
    pattern: `(TBD|TODO|\\?\\?\\?|уточнить|уточняется|будет определено|<[^>]*>)`,
    message: 'Требование не дописано',
    hint: 'Закройте открытый вопрос или вынесите его в реестр вопросов с владельцем и сроком',
  },
  {
    rule: 'passive',
    severity: 'warn',
    pattern: `${L}(должн[оаы]? (быть|осуществляться|производиться|выполняться|обеспечиваться)|осуществляется|производится|обеспечивается)${R}`,
    message: 'Безличная или пассивная форма — кто выполняет действие?',
    hint: '«<Система> должна <глагол>…» — субъект в начале',
  },
  {
    rule: 'pronoun',
    severity: 'info',
    pattern: `^(он|она|оно|они|это|этот|эта|эти|такой|такая|данн(ый|ая|ое))${R}`,
    message: 'Начинается с местоимения — к чему оно относится?',
    hint: 'Требование читают отдельно от соседних — назовите объект явно',
  },
  {
    rule: 'ui-detail',
    severity: 'info',
    pattern: `${L}(кнопк|выпадающ|чекбокс|галочк|всплывающ|модальн\\S* окн|ссылк[аеуи] на экран|цвет[аео]?м?${R}|шрифт)`,
    message: 'Детали интерфейса — это требование или решение дизайна?',
    hint: 'Опишите, что пользователь должен сделать; конкретный элемент интерфейса — в макете',
  },
  {
    rule: 'absolute',
    severity: 'info',
    pattern: `${L}(всегда|никогда|любой|любая|любое|любых|все случаи|100\\s?%)${R}`,
    message: 'Абсолютное утверждение — это действительно без исключений?',
    hint: 'Проверьте граничные случаи; если исключения есть — опишите их',
  },
  {
    rule: 'negative',
    severity: 'info',
    pattern: `${L}не\\s(долж(ен|на|но|ны)|может|допускается)`,
    message: 'Отрицательная формулировка',
    hint: 'Допустимо для запретов (ИБ), но проверьте, что запрет проверяем; часто лучше сказать, что система делает',
  },
];

/** Разбор строки: «FR-01. текст», «FR-01 текст», «| FR-01 | текст | …|». */
export function splitRequirements(input: string): { id?: string; text: string }[] {
  return input
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\|?\s*-{3,}/.test(l) && !/^\|?\s*(ID|№)\s*\|/i.test(l))
    .map((l) => {
      if (l.startsWith('|')) {
        const c = l.split('|').map((x) => x.trim()).filter(Boolean);
        if (c.length >= 2 && /^[A-ZА-Я]{1,6}-\d+$/i.test(c[0])) return { id: c[0], text: c[1] };
        return { text: c.join(' ') };
      }
      const m = l.match(/^([A-ZА-Я]{1,6}-\d+)[.:)\s]\s*(.*)$/i);
      return m ? { id: m[1], text: m[2] } : { text: l.replace(/^[-*•]\s+|^\d+[.)]\s+/, '') };
    });
}

export function lintRequirement(text: string): Issue[] {
  const issues: Issue[] = [];
  for (const r of PATTERN_RULES) {
    if (new RegExp(r.pattern, 'iu').test(text)) issues.push({ ...r });
  }

  const words = text.split(/\s+/).filter(Boolean).length;
  const modals = text.match(new RegExp(MODAL, 'giu')) ?? [];

  // НФТ часто пишут в метрическом стиле без «должна»: «95% событий … не дольше 5 минут» — это нормально.
  const metric = /\d/.test(text);
  if (modals.length === 0 && !metric && !issues.some((i) => i.rule === 'weak-modal')) {
    issues.push({
      rule: 'no-modal',
      severity: 'info',
      message: 'Нет «должна» — это требование или описание?',
      hint: 'Формат ФТ: «<Система> должна <действие> <объект> <условие>». Для НФТ допустим изъявительный стиль («IdM хранит…»), если утверждение проверяемо',
    });
  }
  if (modals.length > 1) {
    issues.push({
      rule: 'compound',
      severity: 'warn',
      pattern: MODAL,
      message: `Несколько «должна» (${modals.length}) — составное требование`,
      hint: 'Одно требование — одна проверка. Разделите на несколько',
    });
  } else if (new RegExp(`${L}(а также|кроме того|помимо этого)${R}`, 'iu').test(text)) {
    issues.push({
      rule: 'compound',
      severity: 'warn',
      pattern: `${L}(а также|кроме того|помимо этого)${R}`,
      message: 'Возможно, составное требование',
      hint: 'Если части можно проверить по отдельности — разделите',
    });
  }
  if (words > 60) {
    issues.push({ rule: 'long', severity: 'info', message: `Длинное требование (${words} слов)`, hint: 'Вынесите правила и детали в таблицу или отдельные требования' });
  }
  if (words < 4) {
    issues.push({ rule: 'short', severity: 'warn', message: 'Слишком коротко — это требование?', hint: 'Кто, что делает, при каком условии' });
  }
  return issues;
}

export function lint(input: string): LintedRequirement[] {
  return splitRequirements(input).map((r) => ({ ...r, issues: lintRequirement(r.text) }));
}

/** Фрагменты текста для подсветки: [текст, найдено ли]. */
export function highlight(text: string, issues: Issue[]): { s: string; hit: Severity | null }[] {
  const marks: { from: number; to: number; sev: Severity }[] = [];
  for (const i of issues) {
    if (!i.pattern) continue;
    for (const m of text.matchAll(new RegExp(i.pattern, 'giu'))) {
      if (m[0]) marks.push({ from: m.index!, to: m.index! + m[0].length, sev: i.severity });
    }
  }
  marks.sort((a, b) => a.from - b.from);
  const out: { s: string; hit: Severity | null }[] = [];
  let pos = 0;
  for (const m of marks) {
    if (m.from < pos) continue;
    if (m.from > pos) out.push({ s: text.slice(pos, m.from), hit: null });
    out.push({ s: text.slice(m.from, m.to), hit: m.sev });
    pos = m.to;
  }
  if (pos < text.length) out.push({ s: text.slice(pos), hit: null });
  return out;
}

// ---------- User story и INVEST ----------

export type InvestLetter = 'I' | 'N' | 'V' | 'E' | 'S' | 'T';
export const INVEST: { letter: InvestLetter; name: string; ru: string; question: string }[] = [
  { letter: 'I', name: 'Independent', ru: 'Независимая', question: 'Можно ли сделать и выпустить её отдельно от других историй?' },
  { letter: 'N', name: 'Negotiable', ru: 'Обсуждаемая', question: 'Описана потребность, а не готовое техническое решение?' },
  { letter: 'V', name: 'Valuable', ru: 'Ценная', question: 'Понятно, какую ценность получит пользователь или бизнес?' },
  { letter: 'E', name: 'Estimable', ru: 'Оцениваемая', question: 'Команда понимает объём и может оценить историю?' },
  { letter: 'S', name: 'Small', ru: 'Небольшая', question: 'Помещается в один спринт вместе с тестированием?' },
  { letter: 'T', name: 'Testable', ru: 'Проверяемая', question: 'Есть критерии приёмки, по которым можно сказать «готово»?' },
];

export interface StoryAnalysis {
  role?: string;
  want?: string;
  benefit?: string;
  formatOk: boolean;
  hints: Partial<Record<InvestLetter, string[]>>;
}

export function analyzeStory(story: string, criteria: string): StoryAnalysis {
  const text = story.replace(/\s+/g, ' ').trim();
  // «Как <роль>, я хочу <действие>, чтобы <ценность>» — ценность после последнего «, чтобы».
  const full = text.match(/^как\s+(.+?),\s*я\s+хочу\s*,?\s*(.+),\s*чтобы\s+(.+?)\.?$/iu);
  const noBenefit = full ? null : text.match(/^как\s+(.+?),\s*я\s+хочу\s*,?\s*(.+?)\.?$/iu);
  const role = full?.[1] ?? noBenefit?.[1];
  const want = full?.[2] ?? noBenefit?.[2];
  const benefit = full?.[3];
  const hints: StoryAnalysis['hints'] = {};
  const add = (l: InvestLetter, s: string) => (hints[l] ??= []).push(s);

  if (!text) return { formatOk: false, hints };
  if (!role) add('V', 'Не распознан формат «Как <роль>, я хочу <действие>, чтобы <ценность>»');
  if (role && !benefit) add('V', 'Нет части «чтобы…» — непонятна ценность');
  if (role && /^(пользовател|юзер|user)/iu.test(role)) add('V', 'Роль «пользователь» слишком общая — кто именно?');
  if (benefit && want && benefit.toLowerCase() === want.toLowerCase()) add('V', 'Ценность повторяет действие');

  const tech = (want ?? text).match(new RegExp(`${L}(API|REST|Kafka|JSON|SQL|БД|баз[аеуы] данных|таблиц\\S*|микросервис\\S*|endpoint|эндпоинт\\S*|кнопк\\S*|форм[аеуы]${R})`, 'iu'));
  if (tech) add('N', `В действии техническое решение («${tech[0]}») — опишите потребность, решение оставьте команде`);

  const ands = ((want ?? '').match(new RegExp(`${L}(и|а также)${R}`, 'giu')) ?? []).length;
  if (ands >= 2) add('S', `В действии ${ands} союза «и» — возможно, это несколько историй`);
  const words = text.split(' ').length;
  if (words > 45) add('S', `Длинная формулировка (${words} слов) — возможно, история крупная`);
  if (new RegExp(`${L}(все|всех|любые|любых)${R}`, 'iu').test(want ?? '')) add('S', '«Все» / «любые» — проверьте объём, можно ли начать с части');

  if (/US-\d+|после того как|зависит от|когда будет готов/iu.test(text)) add('I', 'Похоже на зависимость от другой истории — можно ли её убрать?');

  const vague = VAGUE_WORDS.filter((v) => new RegExp(v.pattern, 'iu').test(text)).map((v) => v.word);
  if (vague.length) add('E', `Размыто: ${vague.map((w) => `«${w}»`).join(', ')} — объём сложно оценить`);

  const crit = criteria.trim();
  if (!crit) add('T', 'Нет критериев приёмки');
  else {
    if (/Сценарий|Scenario|Дано|Given/iu.test(crit) && !/Тогда|Then/iu.test(crit)) add('T', 'В сценарии нет шага «Тогда»');
    const cv = VAGUE_WORDS.filter((v) => new RegExp(v.pattern, 'iu').test(crit)).map((v) => v.word);
    if (cv.length) add('T', `В критериях размыто: ${cv.map((w) => `«${w}»`).join(', ')}`);
  }
  return { role, want, benefit, formatOk: Boolean(role && benefit), hints };
}
