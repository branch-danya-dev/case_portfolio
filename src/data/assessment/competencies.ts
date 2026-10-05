/** Компетенции аттестации — те же 11 областей, что на карте знаний (start/knowledge-map). */
import type { Competency, CompetencyId } from './types';

export const COMPETENCIES: Competency[] = [
  { id: 'requirements', label: 'Требования', refs: ['requirements/levels', 'requirements/quality', 'requirements/acceptance-criteria', 'elicitation/sources', 'requirements/traceability'] },
  { id: 'processes', label: 'Процессы', refs: ['processes/bpmn', 'processes/as-is-to-be', 'processes/gap-analysis'] },
  { id: 'modeling', label: 'Моделирование', refs: ['diagrams/choose', 'diagrams/sequence', 'diagrams/state', 'diagrams/c4'] },
  { id: 'data', label: 'Данные и SQL', refs: ['data/keys-normalization', 'data/sql-joins-aggregates', 'data/transactions-acid', 'data/indexes'] },
  { id: 'integrations', label: 'Интеграции и API', refs: ['integrations/rest', 'integrations/rest-design', 'integrations/contracts', 'integrations/reliability', 'integrations/messaging'] },
  { id: 'architecture', label: 'Архитектура', refs: ['architecture/nfr-iso25010', 'architecture/adr', 'architecture/cap'] },
  { id: 'security', label: 'Безопасность', refs: ['security/overview', 'security/access-control', 'security/tokens-sessions', 'security/threat-modeling'] },
  { id: 'project', label: 'Работа на проекте', refs: ['onboarding', 'role/change-lifecycle', 'requirements/impact-analysis'] },
  { id: 'testing', label: 'Тестирование', refs: ['testing/test-design', 'testing/test-types', 'testing/uat'] },
  { id: 'delivery', label: 'Релиз', refs: ['release/compatibility', 'release/feature-flags', 'release/go-live', 'release/environments'] },
  { id: 'operations', label: 'Эксплуатация', refs: ['operations/incident-analysis', 'operations/rca', 'operations/observability'] },
];

export const competencyById = (id: CompetencyId) => COMPETENCIES.find((c) => c.id === id)!;
