/** Стартовые примеры песочницы Mermaid. Все — на материале кейса IDM-JOINER. */
export interface Starter {
  id: string;
  label: string;
  code: string;
}

export const starters: Starter[] = [
  {
    id: 'sequence',
    label: 'Sequence: создание пользователя АБС с повтором (SEQ-02)',
    code: `sequenceDiagram
    autonumber
    participant HRMS
    participant Bus as Шина (Kafka)
    participant IdM
    participant ABS as Адаптер АБС
    HRMS->>Bus: HIRE (eventId, personId)
    Bus->>IdM: доставка at-least-once
    IdM->>IdM: eventId уже в hr_event_inbox? — пропустить
    IdM->>ABS: POST /users (Idempotency-Key = taskId)
    alt ответ получен
        ABS-->>IdM: 201 Created
    else таймаут — неизвестно, создан ли пользователь
        IdM->>ABS: повтор с тем же Idempotency-Key
        ABS-->>IdM: 200 OK (ранее созданный пользователь)
    end
`,
  },
  {
    id: 'state',
    label: 'State: жизненный цикл учётной записи',
    code: `stateDiagram-v2
    [*] --> PLANNED: роли определены
    PLANNED --> CREATING: за 3 рабочих дня до выхода
    CREATING --> CREATED_DISABLED: создана
    CREATING --> FAILED: ошибка после повторов
    FAILED --> CREATED_DISABLED: задача ServiceDesk выполнена
    CREATED_DISABLED --> ACTIVE: день выхода, 07:00
    CREATED_DISABLED --> DELETED: отмена приёма
    ACTIVE --> [*]
    DELETED --> [*]
`,
  },
  {
    id: 'er',
    label: 'ER: идентичность, трудоустройство, учётные записи',
    code: `erDiagram
    IDENTITY ||--o{ EMPLOYMENT : "имеет"
    IDENTITY ||--o{ ACCOUNT : "владеет"
    ORG_UNIT ||--o{ EMPLOYMENT : "включает"
    EMPLOYMENT ||--o{ ROLE_ASSIGNMENT : "получает"
    BUSINESS_ROLE ||--o{ ROLE_ASSIGNMENT : "назначается"
    IDENTITY {
        uuid identity_id PK
        string person_id UK "из HRMS"
    }
    EMPLOYMENT {
        uuid employment_id PK
        uuid identity_id FK
        string hr_employment_id UK
        date hire_date
    }
    ORG_UNIT {
        string code PK
        string timezone
    }
`,
  },
  {
    id: 'flowchart',
    label: 'Flowchart: генерация логина (FR-06)',
    code: `flowchart TD
    A([ФИО из кадрового события]) --> B[Транслитерация по ICAO Doc 9303]
    B --> C{Есть отчество?}
    C -- Да --> D["фамилия.ИО"]
    C -- Нет --> E["фамилия.И"]
    D --> F{Длиннее 20 символов?}
    E --> F
    F -- Да --> G[Усечь фамилию]
    F -- Нет --> H{Логин свободен в AD<br/>и среди зарезервированных?}
    G --> H
    H -- Да --> OK([Логин назначен])
    H -- Нет --> I{Есть свободный суффикс 2…9?}
    I -- Да --> J[Добавить суффикс] --> H
    I -- Нет --> SD([Задача в ServiceDesk администратору AD])
`,
  },
  {
    id: 'c4',
    label: 'C4: контекст системы (фрагмент)',
    code: `C4Context
    title Контекст IdM (фрагмент)
    Person(hr, "HR-специалист", "Оформляет приказы о приёме")
    Person(mgr, "Руководитель", "Запрашивает доп. доступы")
    System(idm, "IdM", "Роли, SoD, согласования, провижининг")
    System_Ext(hrms, "HRMS", "Кадровая система")
    System_Ext(ad, "Active Directory", "Учётные записи")
    System_Ext(abs, "АБС", "Банковская система")
    Rel(hr, hrms, "Проводит приказ")
    Rel(hrms, idm, "Кадровые события", "Kafka")
    Rel(mgr, idm, "Заявки", "HTTPS")
    Rel(idm, ad, "Учётные записи", "LDAPS")
    Rel(idm, abs, "Пользователи и роли", "REST")
`,
  },
  {
    id: 'class',
    label: 'Class: заявка и её позиции',
    code: `classDiagram
    class AccessRequest {
        +uuid requestId
        +string status
        +submit()
        +cancel()
    }
    class RequestItem {
        +string entitlementCode
        +string status
    }
    class Approval {
        +string decision
        +datetime decidedAt
    }
    AccessRequest "1" *-- "1..*" RequestItem : содержит
    RequestItem "1" o-- "0..*" Approval : согласования
`,
  },
];
