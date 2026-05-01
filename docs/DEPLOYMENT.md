# DEPLOYMENT.md

Инструкция для полного цикла GitHub -> CI -> Railway deploy.

## Цель

После настройки один обычный цикл должен быть таким:

```bash
git add .
git commit -m "..."
git push
```

Дальше GitHub Actions запускает проверки, а Railway автоматически деплоит обновление из подключенной ветки.

## Что уже лежит в репозитории

- `.github/workflows/ci.yml`
  Запускается на `push` и `pull_request` в `master`/`main`.
  Выполняет:
  - `npm ci`
  - `npm run check`
  - `npm test`
  - `docker build -t dom-helper-bot:ci .`

- `railway.json`
  Railway config-as-code:
  - builder: `DOCKERFILE`
  - Dockerfile path: `Dockerfile`
  - start command: `npm start`
  - restart policy: `ON_FAILURE`

- `Dockerfile`
  Production image:
  - Node.js 20 Alpine
  - `npm ci --omit=dev`
  - copies only `src/` and package files

- `.dockerignore`
  Excludes local `.env`, `node_modules`, `.git`, `.github` and `data/db.json` from the image.

## Настройка Railway

1. Создать проект в Railway.
2. Добавить сервис из GitHub repository.
3. Выбрать этот репозиторий.
4. В Service Settings выбрать ветку деплоя:
   - `master`, если репозиторий сейчас на `master`;
   - `main`, если ветка будет переименована.
5. Включить GitHub autodeploy для выбранной ветки.
6. Включить `Wait for CI`, чтобы Railway деплоил только после успешного GitHub Actions workflow.

## Переменные окружения Railway

В Railway service variables обязательно добавить:

```dotenv
BOT_TOKEN=telegram_bot_token_from_botfather
```

Без `BOT_TOKEN` бот не стартует: `src/index.js` специально падает с ошибкой, чтобы не запускаться в некорректном состоянии.

## Проверка перед push

Локально:

```bash
npm run check
npm test
```

Если Docker установлен локально:

```bash
docker build -t dom-helper-bot:ci .
```

Если Docker локально не установлен, этот шаг все равно выполнит GitHub Actions в job `Docker build`.

После push:

1. Открыть GitHub Actions и убедиться, что workflow `CI` зеленый.
2. Открыть Railway Deployments и убедиться, что новый deploy прошел после CI.
3. В Railway Logs должно быть:

```text
DomHelperBot started
```

## Важные ограничения MVP

- Сейчас используется локальный `data/db.json`.
- `data/db.json` не копируется в Docker image, чтобы не запекать локальные пользовательские данные.
- На Railway файловая система контейнера не является полноценной постоянной БД.
- Для тестового MVP это допустимо, но для реального запуска следующим шагом нужна внешняя БД или Railway Volume/Postgres.

## Если push не деплоится

Проверить:

- Railway GitHub App имеет доступ к репозиторию.
- В Railway service включен autodeploy.
- Ветка deploy trigger совпадает с веткой, куда был push.
- Если включен `Wait for CI`, workflow `CI` должен успешно завершиться.
- В service variables задан `BOT_TOKEN`.
