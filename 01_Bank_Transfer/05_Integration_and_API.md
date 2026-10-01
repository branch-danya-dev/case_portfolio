# 05. Интеграционное взаимодействие и API

## 1. Назначение документа

Документ описывает предполагаемое взаимодействие компонентов и внешний REST API функциональности перевода между собственными счетами.

API-контракт в машиночитаемом виде расположен в `api/openapi.yaml`.

---

## 2. Компоненты

### Mobile App

Вызывает Banking Backend по HTTPS.

### Banking Backend

Выполняет аутентификационный контекст, базовую оркестрацию и предоставляет API мобильному приложению.

### Account Service

Предоставляет сведения о счетах и доступном остатке.

### Transfer Service

Отвечает за регистрацию, идемпотентность, состояния и взаимодействие с Core Banking System.

### Core Banking System

Выполняет финансовое движение денежных средств.

---

## 3. Общие API-принципы

- транспорт: HTTPS;
- формат: JSON;
- кодировка: UTF-8;
- версия API: URI versioning, `/api/v1`;
- время: ISO 8601 UTC;
- денежные суммы: decimal, без использования float;
- идентификаторы являются непрозрачными строками;
- создание перевода является идемпотентной операцией.

---

## 4. Авторизация

Все пользовательские запросы требуют действительного access token.

Пример:

```http
Authorization: Bearer <access-token>
```

`clientId` не принимается из тела запроса как доверенный идентификатор. Backend определяет клиента из контекста аутентификации.

---

## 5. Получение доступных счетов

### GET /api/v1/accounts?operation=own-transfer

Упрощённый response:

```json
{
  "accounts": [
    {
      "accountId": "acc-10001",
      "displayName": "Дебетовый счёт",
      "maskedNumber": "•••• 1234",
      "currency": "RUB",
      "availableBalance": 125000.45,
      "status": "ACTIVE",
      "canDebit": true,
      "canCredit": true
    }
  ]
}
```

---

## 6. Предварительная проверка

### POST /api/v1/transfers/validate

Request:

```json
{
  "sourceAccountId": "acc-10001",
  "destinationAccountId": "acc-20002",
  "amount": 10000.00,
  "currency": "RUB"
}
```

Успешная проверка:

```json
{
  "allowed": true
}
```

Бизнес-отказ:

```json
{
  "allowed": false,
  "reasonCode": "INSUFFICIENT_FUNDS",
  "message": "Недостаточно средств для выполнения перевода"
}
```

---

## 7. Создание перевода

### POST /api/v1/transfers

Headers:

```http
Authorization: Bearer <access-token>
Idempotency-Key: 8d2e4c9a-58fc-4a1a-9dad-7bc7b4717352
Content-Type: application/json
```

Request:

```json
{
  "sourceAccountId": "acc-10001",
  "destinationAccountId": "acc-20002",
  "amount": 10000.00,
  "currency": "RUB"
}
```

Response:

```http
202 Accepted
```

```json
{
  "transferId": "tr-987654",
  "status": "PROCESSING",
  "amount": 10000.00,
  "currency": "RUB",
  "createdAt": "2026-10-01T18:41:12Z"
}
```

`202 Accepted` выбран потому, что контракт допускает завершение финансовой операции после принятия запроса.

---

## 8. Получение статуса

### GET /api/v1/transfers/{transferId}

Response:

```json
{
  "transferId": "tr-987654",
  "status": "COMPLETED",
  "sourceAccountId": "acc-10001",
  "destinationAccountId": "acc-20002",
  "amount": 10000.00,
  "currency": "RUB",
  "createdAt": "2026-10-01T18:41:12Z",
  "completedAt": "2026-10-01T18:41:13Z"
}
```

---

## 9. Формат ошибок

Единая форма:

```json
{
  "code": "INSUFFICIENT_FUNDS",
  "message": "Недостаточно средств для выполнения перевода",
  "traceId": "01J9ABCDEF0123456789"
}
```

Предлагаемые коды:

| HTTP | code | Значение |
|---|---|---|
| 400 | INVALID_AMOUNT | Некорректная сумма |
| 400 | SAME_ACCOUNT | Совпадают счета |
| 401 | UNAUTHORIZED | Нет действительной авторизации |
| 403 | ACCOUNT_ACCESS_DENIED | Счёт недоступен клиенту |
| 404 | TRANSFER_NOT_FOUND | Перевод не найден |
| 422 | INSUFFICIENT_FUNDS | Недостаточно средств |
| 422 | ACCOUNT_UNAVAILABLE | Операция по счёту запрещена |
| 422 | UNSUPPORTED_CURRENCY | Валюта не поддерживается |
| 422 | TRANSFER_LIMIT_EXCEEDED | Превышен лимит |
| 500 | INTERNAL_ERROR | Внутренняя ошибка |
| 503 | SERVICE_UNAVAILABLE | Зависимый сервис недоступен |

---

## 10. Идемпотентность

Область уникальности ключа:

```text
(clientId, Idempotency-Key)
```

Поведение:

1. При первом запросе ключ резервируется за создаваемой операцией.
2. При повторном запросе с тем же ключом и теми же параметрами возвращается существующая операция.
3. Повторный запрос с тем же ключом, но иными значимыми параметрами должен отклоняться как конфликт.

Рекомендуемый ответ для конфликта:

```http
409 Conflict
```

```json
{
  "code": "IDEMPOTENCY_KEY_REUSED",
  "message": "Idempotency key already used for another request"
}
```

---

## 11. Retry и timeout

### До передачи финансовой операции

Повтор вызова допустим при соблюдении идемпотентности.

### После передачи в Core Banking

Автоматический retry команды на списание/зачисление недопустим без гарантии идемпотентности со стороны Core Banking.

При timeout необходимо сначала определить фактический статус ранее переданной операции.

---

## 12. Корреляция

Рекомендуемые идентификаторы:

- `transferId` — бизнес-идентификатор перевода;
- `traceId` — трассировка одного технического запроса;
- `Idempotency-Key` — идентификатор пользовательской команды.

Они не должны подменять друг друга.

---

## 13. Взаимодействие с Core Banking System

Конкретный протокол Core Banking намеренно не фиксируется, поскольку это зависит от банковского ландшафта.

Системному контракту требуется как минимум:

- уникальный идентификатор команды;
- источник и получатель;
- сумма и валюта;
- подтверждение принятия;
- получение итогового состояния;
- гарантия или механизм контроля повторного исполнения.

---

## 14. Версионирование

Breaking changes должны публиковаться новой major-версией API.

Добавление необязательных полей response не считается breaking change при условии, что клиенты допускают неизвестные поля.

---

## 15. Связанные документы

- `03_System_Requirements.md`;
- `04_Use_Cases_and_Flows.md`;
- `06_Data_Model.md`;
- `07_Nonfunctional_Requirements.md`;
- `api/openapi.yaml`.
