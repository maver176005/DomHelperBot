# NEXT_SESSION.md

План начала следующей сессии.

## Первый шаг

Подключить постоянную БД вместо локального `data/db.json`.

## Почему это первое

Бот уже работает на Railway без локального запуска, CI/CD настроен, но текущее хранилище файловое.
На Railway файл внутри контейнера не является надежным продуктовым хранилищем.

## Рекомендуемое направление

Для нормального продукта:

- Railway Postgres;
- `DATABASE_URL` в Railway Variables;
- отдельный storage/repository слой вместо прямой записи в JSON;
- миграция текущих сущностей:
  - houses;
  - users;
  - orders;
  - listings.

Для самого быстрого временного MVP можно рассмотреть Railway Volume, но это промежуточное решение.

## Стартовая проверка

Перед изменениями:

```bash
npm run check
npm test
git status --short
```

После подключения БД:

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
