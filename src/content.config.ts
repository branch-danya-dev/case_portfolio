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
  }),
});

/** Переопределения строк интерфейса Starlight (src/content/i18n/ru.json). */
const i18n = defineCollection({ loader: i18nLoader(), schema: i18nSchema() });

export const collections = { docs, i18n, questions, glossary };
