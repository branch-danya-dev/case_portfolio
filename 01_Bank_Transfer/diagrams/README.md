# Диаграммы кейса

В этой директории предполагаются финальные графические артефакты. Документы кейса уже содержат всю необходимую спецификацию; диаграммы можно выполнить в draw.io, PlantUML, Mermaid, Visio или другом инструменте.

## 1. system-context

**Цель:** показать границу решения и внешние/внутренние компоненты.

Узлы:

- Client;
- Mobile App;
- Banking Backend;
- Account Service;
- Transfer Service;
- Core Banking System;
- Logging / Monitoring platform — опционально.

Связи:

```text
Client -> Mobile App
Mobile App -> Banking Backend
Banking Backend -> Account Service
Banking Backend -> Transfer Service
Transfer Service -> Core Banking System
Transfer Service -> Logging / Monitoring
```

Не нужно показывать БД, очереди и внутренние детали, которых нет в Scope.

---

## 2. process-bpmn

**Цель:** показать бизнес-поток перевода.

Рекомендуемые lanes:

- Клиент;
- Mobile App / Digital Channel;
- Bank Backend;
- Core Banking.

Основной поток:

1. открыть перевод;
2. получить счета;
3. выбрать source/destination;
4. ввести сумму;
5. выполнить валидацию;
6. подтвердить;
7. зарегистрировать операцию;
8. выполнить перевод;
9. получить результат;
10. показать клиенту статус.

Gateway:

- операция допустима?;
- Core Banking подтвердил выполнение?

Отдельные exit-path:

- business validation error;
- technical error;
- completed.

---

## 3. sequence-create-transfer

**Цель:** показать интеграционное взаимодействие UC-03.

Участники:

```text
Client
Mobile App
Banking Backend
Account Service
Transfer Service
Core Banking System
```

Сообщения:

1. Client -> Mobile App: confirm transfer
2. Mobile App -> Banking Backend: POST /transfers + Idempotency-Key
3. Banking Backend -> Account Service: validate accounts / balance
4. Account Service --> Banking Backend: account data
5. Banking Backend -> Transfer Service: create transfer
6. Transfer Service -> Transfer Service: check idempotency
7. Transfer Service -> Core Banking: execute transfer
8. Core Banking --> Transfer Service: execution result
9. Transfer Service --> Banking Backend: transfer status
10. Banking Backend --> Mobile App: 202 / current status
11. Mobile App --> Client: show result

Добавить alt-блоки:

- validation failed;
- duplicate idempotency key;
- Core Banking timeout.

---

## 4. transfer-state

**Цель:** жизненный цикл Transfer.

Базовая модель:

```text
CREATED -> PROCESSING -> COMPLETED
                     \-> FAILED
```

Отдельной заметкой указать, что production design может потребовать состояния вроде `PENDING_CONFIRMATION` / `UNKNOWN` для timeout после передачи в Core Banking.

---

## 5. erd

**Цель:** логическая модель данных.

Сущности:

- Client;
- Account;
- Transfer;
- TransferStatusHistory;
- IdempotencyRecord;
- AuditEvent — опционально.

Ключевые связи:

```text
Client 1:N Account
Client 1:N Transfer
Account 1:N Transfer (source)
Account 1:N Transfer (destination)
Transfer 1:N TransferStatusHistory
Transfer 1:0..1 IdempotencyRecord
Transfer 1:N AuditEvent
```

Атрибуты брать из `../06_Data_Model.md`.

---

## Формат имен

Рекомендуемые имена экспортов:

```text
system-context.png
process-bpmn.png
sequence-create-transfer.png
transfer-state.png
erd.png
```

Для PDF-портфолио лучше экспортировать изображения в высоком разрешении или SVG.
