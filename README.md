# course-analytics (analytics-service)

Микросервис аналитики прохождения квизов. Работает как RMQ RPC-сервис: принимает `analytics.submit`, рассчитывает результат, сохраняет попытки в Postgres и отдает агрегаты по пользователю. HTTP используется только для health-check.

## Содержание

- [Обзор](#обзор)
- [Архитектура и поток данных](#архитектура-и-поток-данных)
- [Контракты RMQ](#контракты-rmq)
- [Хранилище](#хранилище)
- [Переменные окружения](#переменные-окружения)
- [Быстрый старт](#быстрый-старт)
- [Docker](#docker)
- [Проверка здоровья](#проверка-здоровья)
- [Скрипты](#скрипты)
- [Структура проекта](#структура-проекта)
- [Диагностика](#диагностика)
- [Лицензия](#лицензия)

## Обзор

- Вход по RMQ: `analytics.submit`, `analytics.getAggByUserId`.
- Расчет `score` и `passed` по данным квиза (порог 70).
- Upsert попытки по ключу `(userId, quizId)` - повторный submit перезаписывает запись.
- Хранилище: PostgreSQL + TypeORM, авто-синхронизация в dev.
- HTTP только для `/health/live` и `/health/ready`.

## Архитектура и поток данных

Компоненты:
- NestJS приложение (HTTP + RMQ microservice).
- PostgreSQL (TypeORM).
- RMQ (очередь `RMQ_ANALYTICS_QUEUE`, по умолчанию `analytics`).
- Логи: pino + перехватчик RMQ.
- RMQ-клиенты для `lessons`, `users`, `analytics` зарегистрированы в модуле (пока не используются в бизнес-логике).

Поток:
1) Другой сервис отправляет RPC `analytics.submit` в очередь analytics.
2) Analytics считает `score` и `passed`, сохраняет/обновляет попытку.
3) Ответ возвращается по RPC с полем `attempt` и теми же `stats`.
4) Для агрегатов отправляется `analytics.getAggByUserId`.

## Контракты RMQ

### analytics.submit

Назначение: принять результат квиза, сохранить попытку и вернуть обновленные данные.

Вход `data`:
- `meta.requestId` - строка для корреляции логов.
- `userId` - id пользователя.
- `dto` - данные попытки.
- `stats` - объект `StatsModel` (пробрасывается обратно без изменений).

`dto`:
- `quizId` (int, required)
- `lessonId` (int, optional)
- `courseId` (int, optional)
- `questionsTotal` (int, min 1)
- `correctCount` (int, min 0)

Пример запроса (RabbitMQ UI / Nest RMQ transport):
```json
{
  "pattern": "analytics.submit",
  "data": {
    "meta": { "requestId": "req-1" },
    "userId": 42,
    "dto": {
      "quizId": 10,
      "lessonId": 1,
      "courseId": 17,
      "questionsTotal": 10,
      "correctCount": 8
    },
    "stats": {
      "quizzesTotal": 5,
      "quizzesPassed": 3,
      "averageScore": 72,
      "coursesEnrolled": 1,
      "coursesAuthored": 0,
      "lessonsTotal": 12,
      "lessonsCompleted": 7,
      "streakDays": 4,
      "lastActiveAt": "2025-09-04T12:25:00.000Z"
    }
  }
}
```

Пример ответа:
```json
{
  "attempt": {
    "quizId": 10,
    "score": 80,
    "passed": true,
    "correctCount": 8,
    "questionsTotal": 10,
    "updatedAt": "2025-09-04T12:25:00.000Z"
  },
  "stats": {
    "quizzesTotal": 5,
    "quizzesPassed": 3,
    "averageScore": 72,
    "coursesEnrolled": 1,
    "coursesAuthored": 0,
    "lessonsTotal": 12,
    "lessonsCompleted": 7,
    "streakDays": 4,
    "lastActiveAt": "2025-09-04T12:25:00.000Z"
  }
}
```

### analytics.getAggByUserId

Назначение: вернуть агрегаты по всем попыткам пользователя.

Вход `data`:
- `meta.requestId`
- `userId`

Пример запроса:
```json
{
  "pattern": "analytics.getAggByUserId",
  "data": { "meta": { "requestId": "req-2" }, "userId": 42 }
}
```

Пример ответа (raw из SQL, значения строками):
```json
{
  "cntAll": "5",
  "cntPassed": "3",
  "avgScore": "76.5",
  "lessonsTotal": "4",
  "lessonsCompleted": "3"
}
```

## Хранилище

Таблица `analystic` (имя как в сущности `QuizAttemptEntity`):

| колонка | тип | примечание |
|---|---|---|
| id | serial PK | |
| user_id | int | |
| quiz_id | int | индекс |
| lesson_id | int nullable | |
| course_id | int nullable | |
| questions_total | int | |
| correct_count | int | |
| score | int | 0..100 |
| passed | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Примечание: сервис делает upsert на уровне приложения по `(userId, quizId)`; уникальный индекс в БД пока не задан.

## Переменные окружения

Минимальный набор:
```env
NODE_ENV=development
PORT=3008

# RMQ
RABBITMQ_URL=amqp://dev:dev@localhost:5672
RMQ_URL=amqp://dev:dev@localhost:5672
RMQ_ANALYTICS_QUEUE=analytics
RMQ_PREFETCH=16
RMQ_DLX=dlx
RMQ_MESSAGE_TTL_MS=0
RMQ_MAX_LENGTH=0

# Postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=analytics_db
POSTGRES_USER=analytics
POSTGRES_PASSWORD=analytics
```

Логи:
- `SERVICE_NAME`, `SERVICE_VERSION` - метки сервиса.
- `LOG_LEVEL` - уровень логов (default `info`).
- `LOG_PRETTY=true` - читабельный вывод в dev.

Важно:
- Сейчас используются две переменные для URL RabbitMQ: `RABBITMQ_URL` (микросервис) и `RMQ_URL` (RMQ клиенты). Для корректного старта установите обе одинаково.
- Приложение слушает порт `PORT` (по умолчанию 3008). В `Dockerfile` указан `EXPOSE 3002` - при необходимости выровняйте.
- Таблица называется `analystic`, не `quiz_attempts`.

## Быстрый старт

Локально:
```bash
npm ci
# заполните .env по примеру выше
npm run start:dev

curl http://localhost:3008/health/live
```

## Docker

```bash
# prod образ
docker build -t analytics-service .
docker run --env-file .env -p 3008:3008 analytics-service

# dev (hot-reload)
docker build --target dev -t analytics-dev .
docker run --env-file .env -p 3008:3008 analytics-dev
```

Если хотите использовать 3002 внутри контейнера, задайте `PORT=3002` и пробросьте `-p 3002:3002`.

## Проверка здоровья

- `GET /health/live`
- `GET /health/ready`

## Скрипты

- `npm run start:dev` - dev режим.
- `npm run build` - сборка.
- `npm run start:prod` - запуск прод сборки.
- `npm run lint` - линтер.
- `npm test` - тесты (пока нет спецификаций).

## Структура проекта

- `src/main.ts` - bootstrap HTTP и RMQ.
- `src/modules/analytics` - обработчики RMQ и бизнес логика.
- `src/modules/health` - health endpoints.
- `src/common` - конфиг и логирование.

## Диагностика

- RMQ connection errors: проверьте `RABBITMQ_URL` и `RMQ_URL`, доступность брокера.
- Сообщения не обрабатываются: проверьте очередь `RMQ_ANALYTICS_QUEUE` (default `analytics`) и pattern.
- Нет таблиц в БД: в prod синхронизация отключена, в dev включена.

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
