import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

const docs = defineCollection({
  loader: docsLoader(),
  schema: docsSchema({
    extend: z.object({
      /** Тематическая страница: показывать «Изучено» и учитывать в общем прогрессе. */
      trackProgress: z.boolean().default(false),
    }),
  }),
});

/**
 * Банк вопросов к собеседованию: один YAML-файл на тему (src/data/questions/<topic>.yaml).
 * Используется на тематических страницах (<InterviewQuestions>), в разделе «Собеседование» и в тренажёре.
 */
const questions = defineCollection({
  loader: glob({ pattern: '*.yaml', base: './src/data/questions' }),
  schema: z.object({
    title: z.string(),
    /** Страница сайта, к которой относится тема (для ссылки «Читать тему»). */
    page: z.string().optional(),
    items: z.array(
      z.object({
        id: z.string().regex(/^[a-z0-9-]+$/),
        level: z.enum(['junior', 'middle', 'senior']),
        /** Часто задают на реальных собеседованиях (по открытым подборкам вопросов). */
        frequent: z.boolean().default(false),
        question: z.string(),
        /** Ответ в Markdown. */
        answer: z.string(),
        tags: z.array(z.string()).default([]),
      }),
    ),
  }),
});

/** Глоссарий: src/data/glossary.yaml — массив терминов. */
const glossary = defineCollection({
  loader: file('src/data/glossary.yaml'),
  schema: z.object({
    term: z.string(),
    en: z.string().optional(),
    definition: z.string(),
    topic: z.string(),
    seeAlso: z.array(z.string()).default([]),
    notToConfuse: z.string().optional(),
    /**
     * Как термин пишется в текстах — для подсказок на страницах (src/plugins/remark-terms.mjs).
     * Строка — точное написание с учётом регистра («БА»); с «*» на конце — основа слова без учёта регистра
     * («идемпотентн*»); в слешах — регулярное выражение («/(FR|NFR)-\d+/»).
     * Аббревиатура в скобках в term («Бизнес-аналитик (БА)») и term из одного латинского слова или
     * аббревиатуры («RACI») добавляются автоматически.
     */
    match: z.array(z.string()).default([]),
  }),
});

/** Каталог ПО: src/data/software.yaml — карточки «что / когда / зачем / аналоги». */
const software = defineCollection({
  loader: file('src/data/software.yaml'),
  schema: z.object({
    name: z.string(),
    group: z.enum(['tasks-docs', 'modeling', 'api', 'data', 'brokers']),
    platforms: z.array(z.enum(['веб', 'десктоп', 'CLI', 'плагин', 'библиотека'])).default([]),
    license: z.enum(['открытый код', 'бесплатно', 'есть бесплатная версия', 'коммерческий']).optional(),
    what: z.string(),
    when: z.string(),
    why: z.string(),
    alternatives: z.array(z.string()).default([]),
    /** Как инструмент связан с кейсом IDM-JOINER. */
    caseUse: z.string().optional(),
  }),
});

/** Переопределения строк интерфейса Starlight (src/content/i18n/ru.json). */
const i18n = defineCollection({ loader: i18nLoader(), schema: i18nSchema() });

export const collections = { docs, i18n, questions, glossary, software };
