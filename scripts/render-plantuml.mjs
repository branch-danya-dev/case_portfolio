// Рендер PlantUML → SVG на этапе сборки.
// Источники: source/idm-joiner-docs/**/*.puml (кейс) и src/diagrams/**/*.puml (примеры сайта).
// Результат: public/diagrams/<case|site>/<путь>.svg — коммитится в git, поэтому сборка
// работает и без Java (рендер тогда просто пропускается).
// Без Graphviz используется встроенный layout-движок Smetana.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const force = process.argv.includes('--force');
const JAR = resolve('vendor/plantuml.jar');
const CACHE = resolve('src/diagrams/.render-cache.json');
const SOURCES = [
  { root: resolve('source/idm-joiner-docs'), out: resolve('public/diagrams/case') },
  { root: resolve('src/diagrams'), out: resolve('public/diagrams/site') },
];

const toPosix = (p) => p.split(sep).join('/');

async function walk(dir) {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])),
  );
  return files.flat().filter((f) => f.endsWith('.puml'));
}

const hasJava = spawnSync('java', ['-version'], { stdio: 'ignore' }).status === 0;
const hasDot = spawnSync('dot', ['-V'], { stdio: 'ignore' }).status === 0;
const cache = existsSync(CACHE) ? JSON.parse(await readFile(CACHE, 'utf8')) : {};

let rendered = 0;
let skipped = 0;
const problems = [];

for (const { root, out } of SOURCES) {
  for (const file of await walk(root)) {
    const rel = toPosix(relative(root, file));
    const target = join(out, rel.replace(/\.puml$/, '.svg'));
    const key = toPosix(relative(resolve('.'), file));
    const src = await readFile(file);
    const hash = createHash('sha256').update(src).digest('hex');

    if (!force && cache[key] === hash && existsSync(target)) {
      skipped++;
      continue;
    }
    if (!hasJava || !existsSync(JAR)) {
      problems.push(`${key}: нужен рендер, но ${hasJava ? 'нет vendor/plantuml.jar (npm run setup:plantuml)' : 'Java не найдена'}`);
      continue;
    }

    const args = ['-Djava.awt.headless=true', '-jar', JAR, '-tsvg', '-charset', 'UTF-8', '-pipe'];
    if (!hasDot) args.push('-Playout=smetana');
    const res = spawnSync('java', args, { input: src, maxBuffer: 64 * 1024 * 1024 });
    const svg = res.stdout.toString('utf8');
    if (res.status !== 0 || !svg.includes('<svg')) {
      problems.push(`${key}: ошибка PlantUML (код ${res.status}) ${res.stderr.toString('utf8').trim()}`);
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, svg);
    cache[key] = hash;
    rendered++;
  }
}

await mkdir(dirname(CACHE), { recursive: true });
await writeFile(CACHE, JSON.stringify(cache, null, 2) + '\n');
console.log(`[plantuml] отрисовано: ${rendered}, без изменений: ${skipped}, layout: ${hasDot ? 'graphviz' : 'smetana'}`);
for (const p of problems) console.warn(`[plantuml] ⚠ ${p}`);
// Ошибка синтаксиса — повод остановить сборку; отсутствие Java — нет (SVG уже в git).
if (problems.some((p) => p.includes('ошибка PlantUML'))) process.exit(1);
