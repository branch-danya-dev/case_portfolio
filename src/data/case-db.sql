-- Учебная БД «Справочника СА» по логической модели кейса IDM-JOINER (03_architecture/03_data-model.md).
-- Упрощения ради читаемости примеров: суррогатные ключи — целые числа вместо uuid, часть атрибутов опущена.
-- Справочник подразделений совпадает с фрагментом из 04_integrations/03_data-mapping.md, плюс офис 2502 без кода АБС.
-- Диалект — SQLite (используется в SQL-тренажёре на sql.js); запросы на страницах раздела «Данные» работают и в PostgreSQL.

CREATE TABLE org_unit (
  org_unit_code   TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  org_unit_type   TEXT NOT NULL,           -- RETAIL_OFFICE, CREDIT_DEPT, ACCOUNTING, IT_DEPT, OTHER
  timezone        TEXT NOT NULL,
  parent_code     TEXT REFERENCES org_unit(org_unit_code),
  abs_branch_code TEXT                      -- код филиала в АБС (может отсутствовать)
);

CREATE TABLE position (
  position_code TEXT PRIMARY KEY,
  name          TEXT NOT NULL
);

CREATE TABLE identity (
  identity_id  INTEGER PRIMARY KEY,
  person_id    TEXT NOT NULL UNIQUE,        -- бизнес-ключ из HRMS
  last_name    TEXT NOT NULL,
  first_name   TEXT NOT NULL,
  middle_name  TEXT,
  mobile_phone TEXT,
  status       TEXT NOT NULL                -- PRE_HIRE, ACTIVE, CANCELLED, TERMINATED
);

CREATE TABLE employment (
  employment_id    INTEGER PRIMARY KEY,
  identity_id      INTEGER NOT NULL REFERENCES identity(identity_id),
  hr_employment_id TEXT NOT NULL UNIQUE,
  org_unit_code    TEXT NOT NULL REFERENCES org_unit(org_unit_code),
  position_code    TEXT NOT NULL REFERENCES position(position_code),
  manager_identity_id INTEGER REFERENCES identity(identity_id),
  employment_type  TEXT NOT NULL,           -- MAIN, PART_TIME
  hire_date        TEXT NOT NULL,           -- ISO 8601: YYYY-MM-DD
  status           TEXT NOT NULL            -- PLANNED, ACTIVE, CANCELLED, TERMINATED
);

CREATE TABLE target_system (
  system_code    TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  connector_type TEXT NOT NULL              -- LDAP, POWERSHELL, REST, MANUAL
);

CREATE TABLE business_role (
  role_id       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  is_birthright INTEGER NOT NULL DEFAULT 0  -- 1 = базовая роль для всех
);

CREATE TABLE entitlement (
  entitlement_id TEXT PRIMARY KEY,
  system_code    TEXT NOT NULL REFERENCES target_system(system_code),
  name           TEXT NOT NULL,
  is_critical    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE role_entitlement (
  role_id        TEXT NOT NULL REFERENCES business_role(role_id),
  entitlement_id TEXT NOT NULL REFERENCES entitlement(entitlement_id),
  PRIMARY KEY (role_id, entitlement_id)
);

CREATE TABLE role_assignment (
  assignment_id INTEGER PRIMARY KEY,
  employment_id INTEGER NOT NULL REFERENCES employment(employment_id),
  role_id       TEXT NOT NULL REFERENCES business_role(role_id),
  source        TEXT NOT NULL               -- RULE, REQUEST
);

CREATE TABLE account (
  account_id  INTEGER PRIMARY KEY,
  identity_id INTEGER NOT NULL REFERENCES identity(identity_id),
  system_code TEXT NOT NULL REFERENCES target_system(system_code),
  login       TEXT NOT NULL,
  status      TEXT NOT NULL,                -- PLANNED, CREATING, CREATED_DISABLED, ACTIVE, FAILED, DELETED
  UNIQUE (identity_id, system_code)
);

CREATE TABLE provisioning_task (
  task_id      INTEGER PRIMARY KEY,
  account_id   INTEGER NOT NULL REFERENCES account(account_id),
  operation    TEXT NOT NULL,               -- CREATE, ENABLE, GRANT, REVOKE, DELETE
  scheduled_at TEXT NOT NULL,
  status       TEXT NOT NULL,               -- SCHEDULED, IN_PROGRESS, RETRY_WAIT, DONE, MANUAL, CANCELLED
  attempts     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE access_request (
  request_id    INTEGER PRIMARY KEY,
  employment_id INTEGER NOT NULL REFERENCES employment(employment_id),
  requester_identity_id INTEGER NOT NULL REFERENCES identity(identity_id),
  status        TEXT NOT NULL,              -- DRAFT, ON_APPROVAL, APPROVED, REJECTED, PROVISIONING, COMPLETED, PARTIALLY_COMPLETED, CANCELLED (как в state-access-request и OpenAPI)
  created_at    TEXT NOT NULL
);

CREATE TABLE request_item (
  item_id        INTEGER PRIMARY KEY,
  request_id     INTEGER NOT NULL REFERENCES access_request(request_id),
  entitlement_id TEXT NOT NULL REFERENCES entitlement(entitlement_id),
  status         TEXT NOT NULL              -- ON_APPROVAL, APPROVED, REJECTED, GRANTED, FAILED (как в OpenAPI)
);

-- ---------- Данные ----------

INSERT INTO org_unit VALUES
  ('0001', 'Головной офис, ДИТ', 'IT_DEPT', 'Europe/Moscow', NULL, '000'),
  ('0102', 'Бухгалтерия', 'ACCOUNTING', 'Europe/Moscow', NULL, '000'),
  ('1601', 'Доп. офис «Екатеринбург-Центр»', 'RETAIL_OFFICE', 'Asia/Yekaterinburg', NULL, '066'),
  ('2501', 'Доп. офис «Владивосток»', 'RETAIL_OFFICE', 'Asia/Vladivostok', NULL, '025'),
  ('2502', 'Доп. офис «Находка»', 'RETAIL_OFFICE', 'Asia/Vladivostok', NULL, NULL);  -- новый офис, кода АБС ещё нет

INSERT INTO position VALUES
  ('40110', 'Операционист'),
  ('40120', 'Старший операционист'),
  ('50010', 'Инженер'),
  ('60010', 'Бухгалтер'),
  ('70010', 'Руководитель офиса');

INSERT INTO identity VALUES
  (1, 'P-100500', 'Иванов', 'Алексей', 'Петрович', '+79001234567', 'PRE_HIRE'),
  (2, 'P-100501', 'Щукина', 'Юлия', NULL, '+79001234568', 'ACTIVE'),
  (3, 'P-100502', 'Петров', 'Олег', 'Игоревич', '+79001234569', 'ACTIVE'),
  (4, 'P-100503', 'Сидорова', 'Анна', 'Сергеевна', '+79001234570', 'TERMINATED'),
  (5, 'P-100504', 'Кузнецов', 'Дмитрий', 'Андреевич', '+79001234571', 'ACTIVE'),
  (6, 'P-100505', 'Смирнова', 'Елена', 'Викторовна', '+79001234572', 'ACTIVE'),
  (7, 'P-100506', 'Волков', 'Игорь', NULL, NULL, 'CANCELLED'),
  (8, 'P-100507', 'Морозова', 'Ольга', 'Павловна', '+79001234573', 'PRE_HIRE');

INSERT INTO employment VALUES
  (10, 1, 'E-2027-00431', '1601', '40110', 5, 'MAIN', '2027-03-15', 'PLANNED'),
  (11, 2, 'E-2025-00102', '0001', '50010', NULL, 'MAIN', '2025-06-01', 'ACTIVE'),
  (12, 3, 'E-2024-00077', '2501', '40110', 6, 'MAIN', '2024-02-12', 'ACTIVE'),
  (13, 3, 'E-2026-00300', '0102', '60010', NULL, 'PART_TIME', '2026-09-01', 'ACTIVE'),
  (14, 4, 'E-2023-00051', '1601', '40110', 5, 'MAIN', '2023-05-10', 'TERMINATED'),
  (15, 5, 'E-2022-00010', '1601', '70010', NULL, 'MAIN', '2022-01-17', 'ACTIVE'),
  (16, 6, 'E-2021-00020', '2501', '70010', NULL, 'MAIN', '2021-08-02', 'ACTIVE'),
  (17, 7, 'E-2027-00440', '1601', '40120', 5, 'MAIN', '2027-03-20', 'CANCELLED'),
  (18, 8, 'E-2027-00452', '2502', '40110', 6, 'MAIN', '2027-03-22', 'PLANNED');

INSERT INTO target_system VALUES
  ('AD', 'Active Directory', 'LDAP'),
  ('EXCHANGE', 'Exchange', 'POWERSHELL'),
  ('ABS', 'АБС', 'REST'),
  ('SED', 'СЭД', 'MANUAL');

INSERT INTO business_role VALUES
  ('ROLE-00', 'Базовая роль', 1),
  ('ROLE-01', 'Операционист доп. офиса', 0),
  ('ROLE-02', 'Руководитель доп. офиса', 0),
  ('ROLE-03', 'Инженер ДИТ', 0),
  ('ROLE-04', 'Бухгалтер', 0);

INSERT INTO entitlement VALUES
  ('AD-USERS', 'AD', 'Группа «Все сотрудники»', 0),
  ('MAIL-BOX', 'EXCHANGE', 'Почтовый ящик', 0),
  ('ABS-OPER', 'ABS', 'Роль АБС «Операционист»', 0),
  ('ABS-CTRL', 'ABS', 'Роль АБС «Контролёр»', 1),
  ('ABS-HEAD', 'ABS', 'Роль АБС «Руководитель офиса»', 1),
  ('AD-IT', 'AD', 'Группа «ДИТ»', 0),
  ('VPN', 'AD', 'Группа «Удалённый доступ»', 0),
  ('SED-USER', 'SED', 'Пользователь СЭД', 0);

INSERT INTO role_entitlement VALUES
  ('ROLE-00', 'AD-USERS'), ('ROLE-00', 'MAIL-BOX'), ('ROLE-00', 'SED-USER'),
  ('ROLE-01', 'ABS-OPER'),
  ('ROLE-02', 'ABS-HEAD'), ('ROLE-02', 'ABS-CTRL'),
  ('ROLE-03', 'AD-IT'), ('ROLE-03', 'VPN'),
  ('ROLE-04', 'SED-USER');

INSERT INTO role_assignment VALUES
  (100, 10, 'ROLE-00', 'RULE'), (101, 10, 'ROLE-01', 'RULE'),
  (102, 11, 'ROLE-00', 'RULE'), (103, 11, 'ROLE-03', 'RULE'),
  (104, 12, 'ROLE-00', 'RULE'), (105, 12, 'ROLE-01', 'RULE'),
  (106, 13, 'ROLE-04', 'RULE'),
  (107, 15, 'ROLE-00', 'RULE'), (108, 15, 'ROLE-02', 'RULE'),
  (109, 16, 'ROLE-00', 'RULE'), (110, 16, 'ROLE-02', 'RULE'),
  (111, 18, 'ROLE-00', 'RULE'), (112, 18, 'ROLE-01', 'RULE');

INSERT INTO account VALUES
  (1000, 1, 'AD', 'ivanov.ap', 'CREATED_DISABLED'),
  (1001, 1, 'EXCHANGE', 'ivanov.ap', 'CREATED_DISABLED'),
  (1002, 1, 'ABS', 'IVANOV.AP', 'FAILED'),
  (1003, 2, 'AD', 'shchukina.i', 'ACTIVE'),
  (1004, 2, 'EXCHANGE', 'shchukina.i', 'ACTIVE'),
  (1005, 3, 'AD', 'petrov.oi', 'ACTIVE'),
  (1006, 3, 'EXCHANGE', 'petrov.oi', 'ACTIVE'),
  (1007, 3, 'ABS', 'PETROV.OI', 'ACTIVE'),
  (1008, 4, 'AD', 'sidorova.as', 'DELETED'),
  (1009, 5, 'AD', 'kuznetsov.da', 'ACTIVE'),
  (1010, 5, 'ABS', 'KUZNETSOV.DA', 'ACTIVE'),
  (1011, 6, 'AD', 'smirnova.ev', 'ACTIVE'),
  (1012, 6, 'ABS', 'SMIRNOVA.EV', 'ACTIVE'),
  (1013, 8, 'AD', 'morozova.op', 'PLANNED');

INSERT INTO provisioning_task VALUES
  (5000, 1000, 'CREATE', '2027-03-10 09:00', 'DONE', 1),
  (5001, 1001, 'CREATE', '2027-03-10 09:00', 'DONE', 1),
  (5002, 1002, 'CREATE', '2027-03-10 09:00', 'MANUAL', 3),
  (5003, 1000, 'ENABLE', '2027-03-15 07:00', 'SCHEDULED', 0),
  (5004, 1001, 'ENABLE', '2027-03-15 07:00', 'SCHEDULED', 0),
  (5005, 1013, 'CREATE', '2027-03-17 09:00', 'SCHEDULED', 0),
  (5006, 1007, 'GRANT', '2026-09-01 10:00', 'DONE', 2),
  (5007, 1010, 'GRANT', '2026-09-15 10:00', 'RETRY_WAIT', 1);

INSERT INTO access_request VALUES
  (300, 11, 5, 'COMPLETED', '2026-09-20 11:00'),
  (301, 12, 6, 'PARTIALLY_COMPLETED', '2026-09-22 15:30'),
  (302, 10, 5, 'ON_APPROVAL', '2027-03-11 10:00'),
  (303, 15, 5, 'REJECTED', '2026-09-25 09:15');

INSERT INTO request_item VALUES
  (400, 300, 'VPN', 'GRANTED'),
  (401, 301, 'VPN', 'GRANTED'),
  (402, 301, 'ABS-CTRL', 'REJECTED'),
  (403, 302, 'VPN', 'ON_APPROVAL'),
  (404, 303, 'AD-IT', 'REJECTED');
