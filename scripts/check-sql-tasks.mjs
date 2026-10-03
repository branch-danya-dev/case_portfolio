// Прогоняет эталонные решения SQL-тренажёра на учебной БД (node:sqlite) и печатает размер результата.
// Задание с пустым результатом или ошибкой — сигнал, что задание или БД разошлись.
// Запуск: node scripts/check-sql-tasks.mjs
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const bundled = await build({ entryPoints: ['src/data/sql-tasks.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { SQL_TASKS } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const sql = readFileSync('src/data/case-db.sql', 'utf8');

let failed = 0;
for (const t of SQL_TASKS) {
  const db = new DatabaseSync(':memory:');
  db.exec(sql);
  try {
    const rows = db.prepare(t.solution).all();
    const mark = rows.length ? 'ok ' : 'ПУСТО';
    if (!rows.length) failed++;
    console.log(`${mark} ${t.id.padEnd(18)} ${rows.length} стр.  ${JSON.stringify(rows.map((r) => Object.values(r))).slice(0, 110)}`);
  } catch (e) {
    failed++;
    console.log(`ОШИБКА ${t.id}: ${e.message}`);
  }
  db.close();
}
if (failed) {
  console.error(`[sql-tasks] проблемных заданий: ${failed}`);
  process.exit(1);
}
console.log(`[sql-tasks] все ${SQL_TASKS.length} эталонов выполняются ✓`);
