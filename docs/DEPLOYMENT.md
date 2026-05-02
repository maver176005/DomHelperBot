# DEPLOYMENT.md

Инструкция для полного цикла GitHub -> CI -> Railway deploy и GitHub Pages deploy.

## Цель

После настройки один обычный цикл должен быть таким:

```bash
git add .
git commit -m "..."
git push
```

Дальше GitHub Actions запускает проверки, Railway автоматически деплоит бота из подключенной ветки, а GitHub Pages публикует статический лендинг из `landing/`.

Текущий статус: Railway deploy настроен и бот отвечает без локального запуска.

## Что уже лежит в репозитории

- `.github/workflows/ci.yml`
  Запускается на `push` и `pull_request` в `master`/`main`.
  Выполняет:
  - `npm ci`
  - `npm run check`
  - `npm test`
  - `docker build -t dom-helper-bot:ci .`

- `.github/workflows/pages.yml`
  Запускается на `push` в `main`, если менялись `landing/**` или сам workflow.
  Выполняет:
  - `actions/configure-pages`
  - `actions/upload-pages-artifact` для папки `landing`
  - `actions/deploy-pages`

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

## Настройка GitHub Pages

1. Открыть репозиторий на GitHub.
2. Перейти в `Settings -> Pages`.
3. В `Build and deployment` выбрать source `GitHub Actions`.
4. После следующего push в `main` открыть workflow `Pages`.
5. URL лендинга будет в job environment `github-pages`, обычно:

```text
https://maver176005.github.io/DomHelperBot/
```

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
2. Если менялся лендинг, убедиться, что workflow `Pages` зеленый.
3. Открыть Railway Deployments и убедиться, что новый deploy прошел после CI.
4. В Railway Logs должно быть:

```text
DomHelperBot started
```

## Важные ограничения MVP

- Сейчас используется локальный `data/db.json`.
- `data/db.json` не копируется в Docker image, чтобы не запекать локальные пользовательские данные.
- На Railway файловая система контейнера не является полноценной постоянной БД.
- Для тестового MVP это допустимо, но первый шаг следующей сессии — подключить постоянную БД.

## Если push не деплоится

Проверить:

- Railway GitHub App имеет доступ к репозиторию.
- В Railway service включен autodeploy.
- Ветка deploy trigger совпадает с веткой, куда был push.
- Если включен `Wait for CI`, workflow `CI` должен успешно завершиться.
- В service variables задан `BOT_TOKEN`.

## Если лендинг не публикуется

Проверить:

- В `Settings -> Pages` выбран source `GitHub Actions`.
- Workflow `Pages` запускается из ветки `main`.
- В workflow есть permissions `pages: write` и `id-token: write`.
- В репозитории есть папка `landing/` с `index.html`.
