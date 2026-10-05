/**
 * Модель данных аттестации. Контент заданий — в соседних модулях (theory.ts, practice.ts, cases/*),
 * движок — в src/lib/assessment, интерфейс — в src/components/assessment. Дизайн — ASSESSMENT.md.
 */
import type { Exchange } from '../../lib/api-lab/mock';

export type ExamId = 'foundation' | 'final';
export type SectionKind = 'theory' | 'practice' | 'case';
export type CompetencyId =
  | 'requirements'
  | 'processes'
  | 'modeling'
  | 'data'
  | 'integrations'
  | 'architecture'
  | 'security'
  | 'project'
  | 'testing'
  | 'delivery'
  | 'operations';

export interface Competency {
  id: CompetencyId;
  label: string;
  /** Страницы для повторения (слаги без слэшей). */
  refs: string[];
}

interface ItemBase {
  id: string;
  kind: SectionKind;
  exams: ExamId[];
  competency: CompetencyId;
  difficulty: 1 | 2 | 3;
  /** Вес задания внутри раздела экзамена. */
  weight: number;
  /** Условие (Markdown). */
  prompt: string;
  /** Разбор (Markdown) — показывается только после завершения попытки. */
  explanation: string;
  /** Страницы для повторения — только после завершения. */
  refs: string[];
  /** Для заданий кейса: какие материалы кейса нужны (id документов пакета). */
  materials?: string[];
}

/** Один правильный вариант. */
export interface SingleItem extends ItemBase {
  type: 'single';
  options: string[];
  answer: number;
}
/** Несколько правильных вариантов: балл = (верно выбранные − неверно выбранные) / число верных, не ниже 0. */
export interface MultipleItem extends ItemBase {
  type: 'multiple';
  options: string[];
  answer: number[];
}
/** Правильный порядок: steps — в правильном порядке, показываются перемешанными. Балл — доля верных соседних пар. */
export interface OrderItem extends ItemBase {
  type: 'order';
  steps: string[];
}
/** Сопоставление: pairs[i].left ↔ pairs[i].right; правые части показываются перемешанными. Балл — доля верных пар. */
export interface MatchItem extends ItemBase {
  type: 'match';
  pairs: { left: string; right: string }[];
}
/** SQL на учебной БД: результат пользователя сравнивается с результатом эталона. */
export interface SqlItem extends ItemBase {
  type: 'sql';
  db: 'idm' | 'limits';
  solution: string;
  ordered: boolean;
}
/** Критерий автоматической проверки по журналу запросов к учебному серверу API Lab. */
export interface HttpCriterion {
  label: string;
  test: (log: Exchange[]) => boolean;
}
/** HTTP-запросы к учебному серверу API Lab; проверяются по журналу того, что реально ушло и пришло. */
export interface HttpItem extends ItemBase {
  type: 'http';
  /** Стартовый текст в консоли (curl). */
  start: string;
  criteria: HttpCriterion[];
  /** Эталонные запросы (curl) для самопроверки движка; плейсхолдеры {{token}}, {{payToken}}, {{orderId}}, {{etag}}. */
  reference: string[];
}
/** JSON Schema: написать схему (mode=schema), которая принимает valid и отклоняет invalid, либо документ (mode=instance), проходящий schema. */
export interface JsonSchemaItem extends ItemBase {
  type: 'json-schema';
  mode: 'schema' | 'instance';
  start: string;
  schema?: object;
  valid?: unknown[];
  invalid?: unknown[];
  /** Дополнительные проверки документа (mode=instance). */
  extra?: { label: string; test: (doc: unknown) => boolean }[];
  reference: string;
}
/** Проверка структуры OpenAPI-документа. */
export interface OpenApiCheck {
  label: string;
  test: (doc: any) => boolean;
}
export interface OpenApiItem extends ItemBase {
  type: 'openapi';
  start: string;
  checks: OpenApiCheck[];
  reference: string;
}
/** Открытый ответ: эталон и рубрика показываются после завершения; балл — самопроверка по рубрике. */
export interface TextItem extends ItemBase {
  type: 'text';
  /** Подсказка в поле ввода. */
  placeholder?: string;
  reference: string;
  rubric: string[];
  /** Частичная автоматическая проверка: линтер требований — ответ не должен содержать ошибок. */
  lint?: 'requirements';
}

export type AutoItem = SingleItem | MultipleItem | OrderItem | MatchItem;
export type Item = AutoItem | SqlItem | HttpItem | JsonSchemaItem | OpenApiItem | TextItem;
export type ItemType = Item['type'];

/** Правило выборки: из пула компетенции взять count заданий (сложность — опционально). */
export interface PickRule {
  competency: CompetencyId;
  count: number;
  difficulty?: (1 | 2 | 3)[];
  /** Только задания этих типов (например, http в практике интеграций). */
  types?: ItemType[];
}

export interface ExamSection {
  id: string;
  kind: SectionKind;
  title: string;
  /** Доля раздела в итоговом балле, в процентах. */
  share: number;
  /** Задания, которые входят всегда. */
  fixed?: string[];
  /** Случайная выборка по компетенциям из пула (kind + exam). */
  pick?: PickRule[];
}

export interface Exam {
  id: ExamId;
  title: string;
  short: string;
  description: string;
  sections: ExamSection[];
  /** Порог «пройден», %. */
  pass: number;
  /** Для сквозного кейса: id кейсов, один выбирается на попытку. */
  cases?: string[];
}

/** Документ пакета экзаменационного кейса. */
export interface CaseMaterial {
  id: string;
  title: string;
  /** Markdown. */
  body: string;
}

export interface ExamCase {
  id: string;
  title: string;
  summary: string;
  materials: CaseMaterial[];
  /** Задания кейса (kind: 'case'). */
  items: Item[];
}
