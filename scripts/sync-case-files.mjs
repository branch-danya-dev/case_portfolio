// Копирует исходники кейса в public/case-files/ (для кнопок «Скачать») и собирает zip-архив.
// public/case-files/ генерируется при каждом dev/build и не хранится в git.
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { zipSync } from 'fflate';

const SRC = resolve('source/idm-joiner-docs');
const OUT = resolve('public/case-files');
const toPosix = (p) => p.split(sep).join('/');

if (!existsSync(SRC)) {
  console.error(`[case-files] не найдена папка ${SRC}`);
  process.exit(1);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await cp(SRC, join(OUT, 'idm-joiner-docs'), { recursive: true });

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return files.flat();
}

const files = await walk(SRC);
const zipEntries = {};
for (const file of files) {
  zipEntries[`idm-joiner-docs/${toPosix(relative(SRC, file))}`] = new Uint8Array(await readFile(file));
}
// Фиксированная дата делает архив побайтно воспроизводимым.
const zip = zipSync(zipEntries, { level: 9, mtime: new Date('2026-01-01T00:00:00Z') });
await writeFile(join(OUT, 'idm-joiner-docs.zip'), zip);

console.log(`[case-files] скопировано файлов: ${files.length}, архив: ${(zip.length / 1024).toFixed(0)} КБ`);
