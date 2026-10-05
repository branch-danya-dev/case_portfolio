-- Учебная БД экзаменационного кейса LIMITS (сервис лимитов карт, CLS). Диалект SQLite.
-- Данные содержат намеренные проблемы: лимиты выше тарифа после пересекающихся временных повышений,
-- суммы из CRM в рублях вместо копеек, дубли изменений после повтора по тайм-ауту.

CREATE TABLE tariff_limit (
  product_code   TEXT NOT NULL,            -- CLASSIC, GOLD, MIR_SOCIAL
  limit_type     TEXT NOT NULL,            -- DAILY, MONTHLY
  max_amount_kop INTEGER NOT NULL,         -- максимум по тарифу, копейки
  PRIMARY KEY (product_code, limit_type)
);

CREATE TABLE card (
  card_id      TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL,
  product_code TEXT NOT NULL,
  status       TEXT NOT NULL               -- ACTIVE, BLOCKED
);

CREATE TABLE card_limit (
  card_id    TEXT NOT NULL REFERENCES card(card_id),
  limit_type TEXT NOT NULL,
  amount_kop INTEGER NOT NULL,             -- действующий лимит, копейки
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,                -- канал последнего изменения: CRM, WEB, MOBILE, SYSTEM
  PRIMARY KEY (card_id, limit_type)
);

CREATE TABLE limit_change (
  change_id       INTEGER PRIMARY KEY,
  card_id         TEXT NOT NULL REFERENCES card(card_id),
  limit_type      TEXT NOT NULL,
  change_type     TEXT NOT NULL,           -- PERMANENT, TEMPORARY, RESTORE (возврат после временного)
  old_amount_kop  INTEGER NOT NULL,
  new_amount_kop  INTEGER NOT NULL,
  channel         TEXT NOT NULL,           -- CRM, WEB, MOBILE, SYSTEM
  status          TEXT NOT NULL,           -- REQUESTED, APPLIED, FAILED, EXPIRED
  requested_at    TEXT NOT NULL,           -- UTC
  applied_at      TEXT,
  expires_at      TEXT,                    -- для TEMPORARY, UTC
  idempotency_key TEXT
);

INSERT INTO tariff_limit VALUES
  ('CLASSIC', 'DAILY', 15000000), ('CLASSIC', 'MONTHLY', 100000000),
  ('GOLD', 'DAILY', 30000000), ('GOLD', 'MONTHLY', 300000000),
  ('MIR_SOCIAL', 'DAILY', 5000000), ('MIR_SOCIAL', 'MONTHLY', 30000000);

INSERT INTO card VALUES
  ('C-1001', 'K-501', 'CLASSIC', 'ACTIVE'),
  ('C-1002', 'K-502', 'GOLD', 'ACTIVE'),
  ('C-1003', 'K-503', 'CLASSIC', 'ACTIVE'),
  ('C-1004', 'K-504', 'MIR_SOCIAL', 'ACTIVE'),
  ('C-1005', 'K-505', 'CLASSIC', 'ACTIVE'),
  ('C-1006', 'K-506', 'GOLD', 'ACTIVE'),
  ('C-1007', 'K-507', 'CLASSIC', 'ACTIVE'),
  ('C-1008', 'K-508', 'GOLD', 'BLOCKED'),
  ('C-1009', 'K-503', 'MIR_SOCIAL', 'ACTIVE');

INSERT INTO card_limit VALUES
  ('C-1001', 'DAILY', 10000000, '2027-11-09T08:12:00Z', 'WEB'),
  ('C-1001', 'MONTHLY', 100000000, '2027-06-01T10:00:00Z', 'CRM'),
  ('C-1002', 'DAILY', 20000000, '2027-11-10T09:01:05Z', 'WEB'),
  ('C-1003', 'DAILY', 20000000, '2027-11-11T20:00:02Z', 'SYSTEM'),
  ('C-1004', 'DAILY', 3000000, '2027-05-20T12:00:00Z', 'CRM'),
  ('C-1005', 'DAILY', 15000, '2027-11-08T14:20:00Z', 'CRM'),
  ('C-1006', 'MONTHLY', 50000, '2027-11-08T15:05:00Z', 'CRM'),
  ('C-1007', 'DAILY', 20000000, '2027-11-11T09:00:02Z', 'MOBILE'),
  ('C-1008', 'DAILY', 10000000, '2027-03-01T10:00:00Z', 'CRM'),
  ('C-1009', 'DAILY', 5000000, '2027-11-10T18:00:00Z', 'MOBILE');

INSERT INTO limit_change VALUES
  (1, 'C-1001', 'DAILY', 'PERMANENT', 5000000, 10000000, 'WEB', 'APPLIED', '2027-11-09T08:11:58Z', '2027-11-09T08:12:00Z', NULL, 'w-77a1'),
  (2, 'C-1002', 'DAILY', 'PERMANENT', 10000000, 20000000, 'WEB', 'FAILED', '2027-11-10T09:00:00Z', NULL, NULL, NULL),
  (3, 'C-1002', 'DAILY', 'PERMANENT', 10000000, 20000000, 'WEB', 'APPLIED', '2027-11-10T09:01:00Z', '2027-11-10T09:01:05Z', NULL, NULL),
  (4, 'C-1003', 'DAILY', 'TEMPORARY', 10000000, 20000000, 'MOBILE', 'EXPIRED', '2027-11-10T12:00:00Z', '2027-11-10T12:00:03Z', '2027-11-11T12:00:00Z', 'm-3a01'),
  (5, 'C-1003', 'DAILY', 'TEMPORARY', 20000000, 28000000, 'MOBILE', 'EXPIRED', '2027-11-10T20:00:00Z', '2027-11-10T20:00:02Z', '2027-11-11T20:00:00Z', 'm-3a02'),
  (6, 'C-1003', 'DAILY', 'RESTORE', 28000000, 10000000, 'SYSTEM', 'APPLIED', '2027-11-11T12:00:00Z', '2027-11-11T12:00:01Z', NULL, NULL),
  (7, 'C-1003', 'DAILY', 'RESTORE', 10000000, 20000000, 'SYSTEM', 'APPLIED', '2027-11-11T20:00:00Z', '2027-11-11T20:00:02Z', NULL, NULL),
  (8, 'C-1005', 'DAILY', 'PERMANENT', 5000000, 15000, 'CRM', 'APPLIED', '2027-11-08T14:19:55Z', '2027-11-08T14:20:00Z', NULL, NULL),
  (9, 'C-1006', 'MONTHLY', 'PERMANENT', 30000000, 50000, 'CRM', 'APPLIED', '2027-11-08T15:04:50Z', '2027-11-08T15:05:00Z', NULL, NULL),
  (10, 'C-1007', 'DAILY', 'TEMPORARY', 10000000, 15000000, 'MOBILE', 'EXPIRED', '2027-11-10T23:00:00Z', '2027-11-10T23:00:01Z', '2027-11-11T23:00:00Z', 'm-7b01'),
  (11, 'C-1007', 'DAILY', 'TEMPORARY', 15000000, 20000000, 'MOBILE', 'APPLIED', '2027-11-11T09:00:00Z', '2027-11-11T09:00:02Z', '2027-11-12T09:00:00Z', 'm-7b02'),
  (12, 'C-1007', 'DAILY', 'RESTORE', 20000000, 10000000, 'SYSTEM', 'FAILED', '2027-11-11T23:00:00Z', NULL, NULL, NULL),
  (13, 'C-1009', 'DAILY', 'PERMANENT', 3000000, 5000000, 'MOBILE', 'APPLIED', '2027-11-10T17:59:58Z', '2027-11-10T18:00:00Z', NULL, 'm-9c01'),
  (14, 'C-1004', 'DAILY', 'PERMANENT', 3000000, 6000000, 'MOBILE', 'FAILED', '2027-11-10T18:30:00Z', NULL, NULL, 'm-4d01');
