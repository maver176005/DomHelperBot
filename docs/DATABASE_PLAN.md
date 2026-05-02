# DATABASE_PLAN.md

План подключения постоянной БД вместо локального `data/db.json`.

## Цель

Перевести Railway deploy с файлового MVP-хранилища на постоянную БД, не ломая текущие Telegram-сценарии.

## Текущий первый этап

Первый внедренный этап — Postgres-backed JSONB state-store.

Приложение сохраняет текущий shape:

```js
{
  houses: [],
  users: [],
  orders: [],
  listings: []
}
```

в таблицу `app_state`. Это сохраняет совместимость с текущей бизнес-логикой и снижает риск регрессий. `DATABASE_URL` включен в Railway Variables, бот запущен и работает. Нормализация в отдельные таблицы остается следующим этапом после проверки сохранения данных через redeploy.

## Выбор

Рекомендуемое направление: Railway Postgres.

Почему не Railway Volume как основной путь:
- Volume быстрее подключить к JSON, но это сохраняет файловую модель;
- Postgres лучше подходит для пользователей, заказов, предложений и будущей web-версии;
- дальше будет проще добавить индексы, фильтры, админку и аналитику.

## Главный принцип миграции

Сначала сохранить текущий API storage-слоя:

- `ensureDb()`
- `readDb()`
- `writeDb(db)`
- `withDb(mutator)`

А реализацию внутри `src/storage/` заменить так, чтобы остальной бот продолжал работать с тем же shape:

```js
{
  houses: [],
  users: [],
  orders: [],
  listings: []
}
```

Это снизит риск: Telegram handlers не нужно переписывать первым шагом.

## Минимальная схема

### houses

- `id text primary key`
- `title text not null`
- `city text`
- `address text not null`
- `is_active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### users

- `id text primary key`
- `telegram_id text not null unique`
- `name text not null`
- `username text`
- `phone text`
- `role text not null`
- `availability_status text`
- `house_id text references houses(id)`
- `entrance text`
- `floor text`
- `apartment text`
- `is_resident_verified boolean not null default false`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

### orders

- `id text primary key`
- `type text not null`
- `service_key text`
- `listing_id text`
- `listing_type text`
- `title text`
- `status text not null`
- `house_id text not null references houses(id)`
- `client_user_id text not null references users(id)`
- `provider_user_id text references users(id)`
- `bags_count integer`
- `comment text`
- `urgency_key text`
- `price text`
- `payment_method text`
- `photo_before_file_id text`
- `photo_after_file_id text`
- `repeated_from_order_id text`
- `created_at timestamptz not null default now()`
- `assigned_at timestamptz`
- `completed_at timestamptz`
- `confirmed_at timestamptz`
- `cancelled_at timestamptz`

### listings

- `id text primary key`
- `type text not null`
- `status text not null`
- `house_id text not null references houses(id)`
- `owner_user_id text not null references users(id)`
- `title text not null`
- `description text not null`
- `terms text`
- `created_at timestamptz not null default now()`
- `closed_at timestamptz`

## Индексы

Минимально:

- `users.telegram_id unique`
- `users.house_id`
- `orders.house_id`
- `orders.client_user_id`
- `orders.provider_user_id`
- `orders.status`
- `listings.house_id`
- `listings.owner_user_id`
- `listings.status`

## Фазы внедрения

### Фаза 1. Подготовить зависимости и env

Добавить:

- `pg`
- `DATABASE_URL` в `.env.example`
- Railway variable `DATABASE_URL`

Команды:

```bash
npm install pg
```

Статус: выполнено.

### Фаза 2. Добавить SQL migrations

Создать:

- `db/migrations/001_init.sql`
- `scripts/migrate.js`
- npm script `db:migrate`

`db:migrate` должен:
- читать `DATABASE_URL`;
- выполнять SQL миграции по порядку;
- вести таблицу `schema_migrations`.

Статус: отложено. На первом этапе таблица `app_state` создается storage-слоем автоматически.

### Фаза 3. Добавить Postgres storage рядом с JSON storage

Создать:

- `src/storage/postgres-store.js`
- `src/storage/index.js`

`src/storage/index.js` выбирает backend:

- если есть `DATABASE_URL` -> Postgres;
- иначе -> JSON.

Так локальный запуск без БД останется рабочим.

Статус: выполнено в совместимом storage-слое `src/storage/json-store.js`.

### Фаза 4. Seed houses

При пустой таблице `houses` вставить `DEFAULT_HOUSES`.

Важно: seed не должен удалять реальные дома.

### Фаза 5. Совместимость shape

Postgres `readDb()` должен возвращать camelCase-объекты в текущем формате:

- `houseId`, а не `house_id`;
- `telegramId`, а не `telegram_id`;
- `createdAt`, а не `created_at`.

`writeDb(db)` для Postgres можно сначала сделать как полную синхронизацию через upsert по всем коллекциям, чтобы сохранить совместимость с `withDb(mutator)`.

Позже это можно заменить на точечные repository-операции.

### Фаза 6. CI и Docker

CI пока может тестировать JSON fallback без Postgres.

Для Postgres добавить отдельные интеграционные тесты позже, когда будет тестовая БД.

Dockerfile менять не нужно, если миграции запускаются командой перед стартом или в `start` script.

Варианты:

1. `start`: `npm run db:migrate && node src/index.js`
2. отдельный Railway pre-deploy command, если будет удобнее.

Для MVP проще вариант 1, но нужно сделать `db:migrate` no-op без `DATABASE_URL`.

## Railway шаги

1. Добавить Railway Postgres service.
2. Подключить Postgres к `DomHelperBot`.
3. Railway должен добавить `DATABASE_URL` в variables сервиса.
4. Redeploy.
5. Проверить logs:
   - миграции прошли;
   - `DomHelperBot started`.
6. Проверить в Telegram:
   - регистрация;
   - создание заказа;
   - создание listing;
   - данные остаются после redeploy.

## Риски

- Текущий `withDb(mutator)` не транзакционный.
- При Postgres-реализации через `read all -> mutate -> write all` возможны race conditions.
- Для MVP это сопоставимо с текущим JSON-подходом, но позже нужно перейти на точечные операции.

## Первое практическое действие следующей сессии

Сделать тест persistence на Railway и проверить, что:

- в логах есть `DomHelperBot started`;
- после redeploy сохраняются регистрация, заказы и listings;
- в Postgres появилась таблица `app_state`.
