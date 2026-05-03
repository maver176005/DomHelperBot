# NEXT_SESSION.md

План начала следующей сессии.

## Первый шаг

Проверить стабильность production после выключения Railway `Serverless`.

Подробный план: [DATABASE_PLAN.md](/Users/mac/WebstormProjects/DomHelperBot/docs/DATABASE_PLAN.md).

## Почему это первое

Бот снова работает на Railway, `DATABASE_URL` добавлен, storage-слой переключен на Postgres-backed JSONB state-store.
`Wait for CI` включен, `Serverless` выключен у `DomHelperBot` и Postgres. Теперь нужно подтвердить, что первый клик после простоя отвечает сразу, а данные сохраняются после redeploy.

## Проверить в начале сессии

- GitHub Actions `CI` зеленый после последнего push.
- Railway deployment активный.
- В логах есть `DomHelperBot started`.
- `Serverless` выключен у `DomHelperBot` и Postgres.
- В Telegram бот отвечает на `/start`.
- Первый клик после паузы не дает "Что-то пошло не так".
- После тестовой регистрации данные остаются после `Redeploy`.
- В Railway Postgres есть таблица `app_state`.

## Следующие продуктовые варианты

- Telegram Web App / Mini App для красивого интерфейса внутри Telegram.
- Нормализовать Postgres schema из `app_state` в таблицы `houses/users/orders/listings`.
- Улучшить `Listing`: категории, поиск, фото, календарь/слоты.
- Printable poster layout на основе текущего лендинга и QR.

## Стартовая проверка

Перед изменениями:

```bash
npm run check
npm test
git status --short
```

После изменений:

```bash
npm run check
npm test
git push
```

И проверить:

- GitHub Actions зеленый;
- Railway deploy успешный;
- бот отвечает в Telegram;
- данные сохраняются после redeploy.
