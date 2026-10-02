// Копирует браузерные бандлы, которые подключаются тегом <script>, из node_modules в public/vendor/.
// public/vendor/ генерируется и не хранится в git.
//
// Redoc: в бандле есть единственная сетевая загрузка — логотип Redocly в подвале меню
// (https://cdn.redoc.ly/redoc/logo-mini.svg). Подменяем его локальным файлом, атрибуция сохраняется.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT = resolve('public/vendor/redoc');
const REMOTE_LOGO = 'https://cdn.redoc.ly/redoc/logo-mini.svg';

await mkdir(OUT, { recursive: true });
const bundle = await readFile(resolve('node_modules/redoc/bundles/redoc.standalone.js'), 'utf8');
if (!bundle.includes(REMOTE_LOGO)) {
  console.warn('[vendor] в бандле Redoc не найден адрес логотипа — проверьте, нет ли новых внешних загрузок');
}
await writeFile(resolve(OUT, 'redoc.standalone.js'), bundle.replaceAll(REMOTE_LOGO, '/vendor/redoc/logo-mini.svg'));
await writeFile(
  resolve(OUT, 'logo-mini.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#0f766e"/><text x="8" y="11.5" font-size="9" text-anchor="middle" fill="#fff" font-family="sans-serif">R</text></svg>\n',
);
console.log('[vendor] redoc.standalone.js скопирован (логотип — локальный)');
