// Скачивает plantuml.jar в vendor/ (один раз; нужна сеть только на этом шаге).
// Версия закреплена, чтобы рендер был воспроизводимым.
import { mkdir, writeFile, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const VERSION = '1.2026.8';
const URL = `https://github.com/plantuml/plantuml/releases/download/v${VERSION}/plantuml-${VERSION}.jar`;
const target = resolve('vendor/plantuml.jar');

try {
  await access(target);
  console.log(`[plantuml] уже есть: ${target}`);
  process.exit(0);
} catch {}

console.log(`[plantuml] скачиваю ${URL}`);
const res = await fetch(URL);
if (!res.ok) {
  console.error(`[plantuml] ошибка загрузки: HTTP ${res.status}`);
  process.exit(1);
}
await mkdir(dirname(target), { recursive: true });
await writeFile(target, Buffer.from(await res.arrayBuffer()));
console.log(`[plantuml] сохранено: ${target}`);
