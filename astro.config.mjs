// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import starlightLinksValidator from 'starlight-links-validator';
import { unified } from '@astrojs/markdown-remark';
import remarkMermaid from './src/plugins/remark-mermaid.mjs';
import { sections } from './src/sections.mjs';

const sidebar = sections
  .filter((s) => s.ready)
  .map((s) => ({
    label: s.label,
    collapsed: s.collapsed ?? false,
    items: [{ autogenerate: { directory: s.id } }],
  }));

export default defineConfig({
  // Сайт работает локально; site нужен только для абсолютных ссылок в sitemap.
  site: 'http://localhost:4321',
  trailingSlash: 'ignore',
  integrations: [
    starlight({
      title: 'Справочник системного аналитика',
      description: 'Шпаргалка и гайд для системного аналитика: темы, диаграммы, инструменты, вопросы к собеседованию и учебный кейс IDM-JOINER.',
      defaultLocale: 'root',
      locales: { root: { label: 'Русский', lang: 'ru' } },
      logo: { src: './src/assets/logo.svg', alt: 'СА' },
      favicon: '/favicon.svg',
      customCss: [
        '@fontsource-variable/inter',
        '@fontsource-variable/jetbrains-mono',
        './src/styles/custom.css',
        './src/styles/print.css',
      ],
      components: {
        Head: './src/components/overrides/Head.astro',
        ThemeProvider: './src/components/overrides/ThemeProvider.astro',
        PageTitle: './src/components/overrides/PageTitle.astro',
      },
      sidebar: [{ label: 'Главная', link: '/' }, ...sidebar],
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      lastUpdated: false,
      pagination: true,
      credits: false,
      expressiveCode: {
        themes: ['github-dark', 'github-light'],
        styleOverrides: {
          codeFontFamily: "'JetBrains Mono Variable', ui-monospace, monospace",
          uiFontFamily: "'Inter Variable', system-ui, sans-serif",
          borderRadius: '0.5rem',
        },
      },
      plugins: [
        starlightLinksValidator({
          // Ссылки внутри собственных компонентов тоже проверяются.
          components: [
            ['CaseRef', 'href'],
            ['DownloadButton', 'href'],
          ],
        }),
      ],
    }),
    react(),
  ],
  markdown: {
    // remark-плагины работают на unified-процессоре (в Astro 7 по умолчанию Sätteri).
    processor: unified({ remarkPlugins: [remarkMermaid] }),
  },
  vite: {
    // bpmn-js и mermaid тяжёлые: отдельные чанки грузятся только там, где нужны.
    build: { chunkSizeWarningLimit: 4000 },
  },
});
