# course-analytics

NestJS‑микросервис для аналитики квизов. Слушает событие `quiz.submitted` из RabbitMQ, **идемпотентно** сохраняет попытки по `(userId, quizId)`, считает базовые агрегаты и предоставляет HTTP‑эндпойнты для статистики.

---

## Содержание

- [Функционал](#функционал)
- [Технологии](#технологии)
- [Переменные окружения](#переменные-окружения)
- [Быстрый старт](#быстрый-старт)
  - [Локально (Node)](#локально-node)
  - [Docker Compose (dev)](#docker-compose-dev)
- [Публикация тестового события в RabbitMQ UI](#публикация-тестового-события-в-rabbitmq-ui)
- [HTTP API](#http-api)
- [Структура БД](#структура-бд)
- [Тесты и линт](#тесты-и-линт)
- [CI/CD и релизы](#cicd-и-релизы)
- [Kubernetes (примеры)](#kubernetes-примеры)
- [Troubleshooting](#troubleshooting)
- [Лицензия](#лицензия)

---

## Функционал

- Принимает событие `quiz.submitted` (RabbitMQ) и **идемпотентно** upsert’ит попытку по `(userId, quizId)`.
- Вычисляет `score` и `passed` (либо принимает их из события) и сохраняет в БД.
- HTTP‑эндпойнты:
  - `GET /analytics/quiz/:quizId/summary` — агрегаты по квизу.
  - `GET /analytics/user/:userId/summary` — список попыток пользователя.

---

## Технологии

- **NestJS** (HTTP + RMQ microservice)
- **RabbitMQ** (transport)
- **PostgreSQL 17** + **TypeORM**
- **Jest** (юнит‑тесты)
- **GitHub Actions** (CI)

---

## Переменные окружения

Пример: `.env.example`

```env
NODE_ENV=development
PORT=3005

# RabbitMQ
RMQ_URL=amqp://dev:dev@localhost:5672

# Postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=analytics_db
POSTGRES_USER=analytics
POSTGRES_PASSWORD=analytics

# Бизнес‑настройки
PASSING_SCORE=70
```

> В Kubernetes значения подставляются через ConfigMap/Secret (см. ниже).

---

## Быстрый старт

### Локально (Node)

```bash
# 1) Установка зависимостей
npm ci

# 2) Заполни .env (см. .env.example) и подними Postgres + RabbitMQ

# 3) Запуск сервиса в dev‑режиме (hot‑reload)
npm run start:dev

# Проверка здоровья
curl http://localhost:3005/health/live
```

### Docker Compose (dev)

Минимальный compose для сервиса:

```yaml
services:
  rabbitmq:
    image: rabbitmq:3.13-management
    ports: ["5672:5672", "15672:15672"]
    environment:
      RABBITMQ_DEFAULT_USER: dev
      RABBITMQ_DEFAULT_PASS: dev

  db_analytics:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: analytics_db
      POSTGRES_USER: analytics
      POSTGRES_PASSWORD: analytics
    ports: ["5435:5432"]

  analytics:
    image: your-registry/course_analytics:dev
    env_file: .env
    ports: ["3005:3005"]
    depends_on: [rabbitmq, db_analytics]
```

---

## Публикация тестового события в RabbitMQ UI

1. Открой **Queues**, выбери очередь **analytics** → **Publish message**.
2. Отправляй payload в формате транспорта Nest (`{"pattern": "...", "data": {...}}`). Пример:

```json
{
  "pattern": "quiz.submitted",
  "data": {
    "messageId": "test-uuid-1",
    "occurredAt": "2025-09-04T12:25:00.000Z",
    "payload": {
      "userId": "user-1",
      "quizId": 10,
      "lessonId": 1,
      "courseId": 17,
      "questionsTotal": 10,
      "correctCount": 8,
      "score": 80,
      "passed": true
    }
  }
}
```

> Видишь в UI жёлтое *“Message published, but not routed”* — публикуешь не в ту очередь/эксчендж. Иди в **Queues → analytics → Publish message** и отправляй JSON в формате выше.

---

## HTTP API

### `GET /analytics/quiz/:quizId/summary`

**Пример ответа:**

```json
{
  "quizId": 10,
  "participants": 42,
  "passes": 31,
  "passRate": 0.738,
  "avgScore": 84.2
}
```

### `GET /analytics/user/:userId/summary`

**Пример ответа:**

```json
[
  { "quizId": 10, "score": 80, "passed": true,  "updatedAt": "2025-09-04T12:25:00.000Z" },
  { "quizId": 11, "score": 65, "passed": false, "updatedAt": "2025-09-01T10:00:00.000Z" }
]
```

---

## Структура БД

**Таблица `quiz_attempts`:**

| колонка          | тип           | примечание                         |
|------------------|---------------|------------------------------------|
| id               | serial PK     |                                    |
| message_id       | varchar(100)  | **UNIQUE** (идемпотентность)       |
| user_id          | varchar(64)   |                                    |
| quiz_id          | int           | **UNIQUE** вместе с `(user_id)`    |
| lesson_id        | int null      |                                    |
| course_id        | int null      |                                    |
| questions_total  | int           |                                    |
| correct_count    | int           |                                    |
| score            | int           | 0..100                             |
| passed           | boolean       |                                    |
| created_at       | timestamptz   |                                    |
| updated_at       | timestamptz   |                                    |

**Индексы:**

- `UNIQUE (user_id, quiz_id)`
- `UNIQUE (message_id)`
- `INDEX (quiz_id)`

---

## Тесты и линт

```bash
# Юнит‑тесты
npm test

# Линтер
npm run lint
```

В проекте есть пример юнит‑теста `analytics.service.spec.ts`.
Репозиторий и RMQ в тестах мокируются, БД не требуется.

---

## CI/CD и релизы

- PR в `main` → запускаются Lint/Build/Test.
- Пуш тега `v*.*.*` или pre‑release (`v1.0.0-alpha1`, `v1.2.0-beta2`) →
  GitHub Actions собирает multi‑arch Docker‑образ и пушит в Docker Hub:

  ```
  ${DOCKERHUB_USERNAME}/<repo>:<tag>
  ${DOCKERHUB_USERNAME}/<repo>:latest
  ```

  Также создаётся ветка `release/<tag>` для быстрого rollback.

**Как создать тег**

Через GitHub Releases (UI):

1. *Releases* → *New release*
2. *Choose a tag*: `v1.0.0` или pre‑release `v1.0.0-alpha_1`
3. Для нестабильной версии поставь чекбокс **Set as a pre-release**
4. *Publish release*

Через `git` (CLI):

```bash
git checkout main
git pull
git tag v1.0.0-alpha_1   # SemVer с точкой работает через CLI
git push origin v1.0.0-alpha_1
```

---

## Kubernetes (примеры)

**ConfigMap (dev):**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: analytics-config
  namespace: course
data:
  NODE_ENV: "development"
  PORT: "3005"
  RMQ_URL: "amqp://dev:dev@rabbitmq.course.svc:5672"
  POSTGRES_HOST: "postgres.course.svc"
  POSTGRES_PORT: "5432"
  POSTGRES_DB: "analytics_db"
  POSTGRES_USER: "analytics"
```

**Deployment (dev):**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: analytics
  namespace: course
  labels:
    app: analytics
spec:
  replicas: 1
  selector:
    matchLabels:
      app: analytics
  template:
    metadata:
      labels:
        app: analytics
    spec:
      containers:
        - name: app
          image: your-registry/course_analytics:dev
          ports:
            - name: http
              containerPort: 3005
          envFrom:
            - configMapRef:
                name: analytics-config
            - secretRef:
                name: jwt-public
          env:
            - name: POSTGRES_PASSWORD
              value: "analytics"
          readinessProbe:
            httpGet:
              path: /health/ready
              port: http
          livenessProbe:
            httpGet:
              path: /health/live
              port: http
          resources:
            requests:
              cpu: "50m"
              memory: "128Mi"
            limits:
              cpu: "300m"
              memory: "384Mi"
```

---

## Troubleshooting

- **RabbitMQ UI:** *“Message published, but not routed”* — публикуешь не в ту очередь/эксчендж. Для тестов заходи в **Queues → analytics → Publish message** и отправляй JSON в формате `{ "pattern": "...", "data": {...} }`.
- **PRECONDITION_FAILED – unknown delivery tag:** возникает при ручных `ack` после закрытия канала/дублирующемся `ack`. В текущей реализации обработчик делает авто‑ack через Nest при успешном завершении хендлера.
- **`npm test` падает из‑за отсутствия тестов:** в CI/локально используем jest без `--passWithNoTests`. Добавь хотя бы один простой юнит‑тест (пример в `src/modules/analytics/test`).

---

## Лицензия

Evaluation License Agreement
Version 1.0 — 2025-09-08

Copyright (c) 2025
Holder: Golovchenko Vasili Vyacheslavovich
Contact: 

1. Grant of License
Licensor grants you a limited, non-exclusive, non-transferable, revocable license to download, install, and use the Software and its documentation (“Software”) solely for internal evaluation and non-production development within your organization. No right is granted to deploy the Software in production, provide it as a service to third parties, or use it for any commercial purpose.

2. Restrictions
You shall not, and shall not permit anyone to:
  (a) use the Software in production or for any commercial or revenue-generating purpose;
  (b) disclose, publish, distribute, sell, sublicense, rent, lease, host, or otherwise make the Software available to any third party;
  (c) modify, translate, adapt, merge, or create derivative works of the Software, except to the extent strictly necessary for internal evaluation;
  (d) reverse engineer, decompile, or disassemble the Software, except as expressly permitted by applicable law notwithstanding this limitation;
  (e) remove or alter any proprietary notices or marks on or within the Software;
  (f) publish or disclose performance or benchmarking results regarding the Software without Licensor’s prior written consent.

3. Ownership
The Software is licensed, not sold. Licensor retains all right, title, and interest in and to the Software, including all intellectual property rights. No implied licenses are granted.

4. Feedback
If you provide feedback, ideas, or suggestions (“Feedback”), you grant Licensor a perpetual, irrevocable, worldwide, royalty-free license to use such Feedback for any purpose.

5. Confidentiality
The Software, documentation, and any non-public information disclosed by Licensor are Licensor’s confidential information. You must protect them with at least the same degree of care you use for your own confidential information and not less than a reasonable degree of care.

6. Term and Termination
This Agreement remains in effect until terminated. Licensor may terminate it at any time upon notice if you breach it or at Licensor’s discretion for evaluation program changes. Upon termination, you must immediately cease all use of the Software and destroy all copies.

7. Disclaimers
THE SOFTWARE IS PROVIDED “AS IS” AND “AS AVAILABLE”, WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.

8. Limitation of Liability
TO THE MAXIMUM EXTENT PERMITTED BY LAW, LICENSOR SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, OR GOODWILL, EVEN IF ADVISED OF THE POSSIBILITY. LICENSOR’S TOTAL LIABILITY UNDER THIS AGREEMENT SHALL NOT EXCEED ONE HUNDRED (100) USD OR THE AMOUNT YOU PAID FOR THE SOFTWARE (IF ANY), WHICHEVER IS GREATER.

9. Export and Compliance
You agree to comply with all applicable laws and regulations, including export control and sanctions laws.

10. General
If any provision is held unenforceable, it will be modified to the minimum extent necessary to be enforceable, and the remainder will remain in effect. This Agreement constitutes the entire agreement regarding the evaluation license and supersedes all prior discussions.

For commercial/production licensing, contact: 