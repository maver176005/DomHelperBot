# PROJECT_MAP.md

Короткая карта проекта для быстрой навигации.

## Источники истины

- `PROJECT.md` — продукт, бизнес-правила, границы MVP
- `TASK.md` — текущая задача
- `README.md` — как запускать и проверять проект локально
- `PROJECT_MAP.md` — где что лежит
- `STATUS.md` — что уже реализовано и что еще упрощено

## Текущая структура

- `src/index.js`
  Главная точка входа Telegram-бота.
  Здесь находятся:
  - запуск `telegraf`
  - регистрация
  - выбор дома
  - trash removal flow
  - listing flow для услуг и аренды
  - действия по заказам
  - текстовые сценарии и кнопки
  - вызовы локального JSON-хранилища

- `src/config/app-data.js`
  Общие доменные и UI-данные проекта.
  Здесь лежат:
  - шаблоны услуг
  - статусы
  - варианты оплаты
  - срочность
  - статусы доступности исполнителя

- `src/config/ui-copy.js`
  Базовый интерфейсный словарь.
  Здесь лежат:
  - подписи главного меню
  - общие CTA, которые потом пригодятся и web-версии

- `src/config/seed-data.js`
  Стартовые локальные данные для первого запуска.
  Здесь лежат:
  - тестовые дома
  - стартовая структура `DEFAULT_DB`

- `src/domain/order-helpers.js`
  Общие хелперы домена заказов.
  Здесь лежат:
  - отображение статусов
  - работа с срочностью
  - вычисление популярных услуг
  - вычисление доступности исполнителей

- `src/domain/registration-validation.js`
  Чистая проверка регистрационных данных.
  Здесь лежат:
  - проверка имени
  - нормализация и проверка телефона
  - проверка подъезда, этажа и квартиры

- `src/domain/listing-helpers.js`
  Чистая доменная логика предложений.
  Здесь лежит:
  - сборка заказа из предложения услуги или аренды

- `src/storage/json-store.js`
  Совместимый storage-слой.
  Здесь лежат:
  - путь к `data/db.json`
  - `ensureDb()`
  - `readDb()`
  - `writeDb()`
  - `withDb()`
  - выбор backend: локальный JSON без `DATABASE_URL`, Postgres JSONB state-store при `DATABASE_URL`

- `src/presentation/telegram-text.js`
  Чистое форматирование Telegram-текстов без Telegraf handlers.
  Здесь лежат:
  - подписи ролей и домов
  - публичная карточка заказа
  - карточка назначенного заказа
  - краткая карточка заказа для личных списков
  - текст профиля

- `src/presentation/telegram-keyboards.js`
  Сборка Telegram reply/inline keyboards.
  Здесь лежат:
  - главное меню
  - клавиатура отмены
  - клавиатуры срочности, оплаты и доступности
  - inline-кнопки профиля, услуг и заказов

- `src/notifications/telegram-notifications.js`
  Отправка Telegram-уведомлений между клиентом и исполнителями.
  Здесь лежат:
  - уведомление исполнителей дома о новом заказе
  - уведомление клиента о назначении исполнителя
  - уведомление клиента о завершении
  - уведомления исполнителя о подтверждении или отмене

- `data/db.json`
  Локальное хранилище данных.
  Создается автоматически при первом запуске.
  Содержит:
  - `houses`
  - `users`
  - `orders`
  - `listings`

- `.env`
  Локальный конфиг для `BOT_TOKEN`.

- `.env.example`
  Шаблон переменных окружения.

- `package.json`
  Зависимости и npm-скрипты.

- `docs/`
  Навигационная и инженерная документация проекта.

- `docs/NEXT_SESSION.md`
  Короткий handoff на следующую рабочую сессию.

- `docs/REG_RU_DEPLOYMENT.md`
  Инструкция переноса Telegram-бота на VPS в REG.RU.

- `landing/`
  Статический лендинг, объясняющий пользу бота для жильцов дома.

- `test/`
  Первые unit-тесты чистых модулей на встроенном `node:test`.

- `.github/workflows/ci.yml`
  GitHub Actions workflow для `npm run check`, `npm test` и Docker build.

- `railway.json`
  Railway config-as-code для Dockerfile deploy и запуска сервиса через `npm start`.

- `Dockerfile`
  Production image для Railway.

- `.dockerignore`
  Исключения для Docker build context.

- `ecosystem.config.cjs`
  PM2-конфиг для запуска бота на VPS.

## Логические блоки в `src/index.js`

Порядок в файле сейчас такой:

1. Константы и пути
2. Работа с `.env`
3. Хелперы пользователей, домов и заказов
4. Общие доменные константы из `src/config/app-data.js`
5. Запуск flow регистрации и заказа
6. `createBot()` и все Telegram handlers
7. Локальный запуск через `require.main === module`

## Где менять что

- Если меняется бизнес-логика:
  смотри `PROJECT.md`, потом правь `src/index.js`

- Если меняется сценарий регистрации:
  смотри `REGISTRATION_STEPS` и обработчик `bot.on('text')`

- Если меняются правила проверки данных регистрации:
  смотри `src/domain/registration-validation.js`

- Если меняется сценарий заказа на мусор:
  смотри `ORDER_STEPS`, `startTrashOrder()`, `startRepeatTrashOrder()`, `bot.on('photo')`, `bot.on('text')`

- Если меняется сценарий предложений услуг и аренды:
  смотри `LISTING_STEPS`, `showListingsHub()`, `showHouseListings()`, `showMyListings()`, `startListingFlow()`, `createListingFromFlow()`

- Если меняется создание заказа из предложения:
  смотри `src/domain/listing-helpers.js` и handler `listing_create_order`

- Если меняются карточки и тексты:
  смотри `src/presentation/telegram-text.js`, затем `showStart()` в `src/index.js`

- Если меняются шаблоны услуг, статусы или кнопочные опции:
  смотри `src/config/app-data.js`

- Если меняются меню и базовые подписи интерфейса:
  смотри `src/config/ui-copy.js`

- Если меняются Telegram-клавиатуры:
  смотри `src/presentation/telegram-keyboards.js`

- Если меняются Telegram-уведомления:
  смотри `src/notifications/telegram-notifications.js`

- Если меняется общая логика представления заказов и доступности:
  смотри `src/domain/order-helpers.js`

- Если меняется локальное JSON-хранилище или seed-структура данных:
  смотри `src/storage/json-store.js` и `src/config/seed-data.js`

- Если меняются действия по заказу:
  смотри handlers:
  - `take_order`
  - `view_order`
  - `repeat_order`
  - `complete_order`
  - `confirm_order`
  - `cancel_order`

- Если меняется меню:
  смотри `getMainKeyboard()`, `getCancelKeyboard()`, `getProfileInlineKeyboard()`

- Если меняются чистые доменные или presentation-хелперы:
  обнови соответствующие тесты в `test/`

## Текущие упрощения

- Основная Telegram-flow логика пока в одном файле `src/index.js`
- Нет отдельного слоя сервисов / репозиториев / моделей
- Нет внешней БД
- Нет миграций
- Нет админки
- Нет web-версии с отдельным UI

Это нормально для текущего MVP, но если проект начнет расти, первым кандидатом на разделение будет `src/index.js`.
