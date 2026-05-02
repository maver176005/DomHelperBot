# REG_RU_DEPLOYMENT.md

Резервный план запуска Telegram-бота на VPS в REG.RU.

На 2026-05-03 REG.RU не является основным runtime проекта. Основной production runtime: Railway + Railway Postgres. Лендинг остается на GitHub Pages.

## Статус на 2026-05-03

При тестовом запуске на REG.RU бот упал на запросе к Telegram API:

```text
FetchError: request to https://api.telegram.org/.../getMe failed, reason:
code: ETIMEDOUT
```

Ответ поддержки REG.RU: наблюдаются массовые проблемы с доступностью или медленным ответом `api.telegram.org`. Вероятная причина - замедление Telegram на территории РФ через ТСПУ у операторов связи. Проблема не относится к инфраструктуре REG.RU и дата-центра.

Решение проекта:

- не переносить основной runtime на REG.RU;
- не запускать постоянный PM2-процесс на REG.RU без успешной сетевой проверки;
- использовать Railway как основной runtime;
- рассматривать REG.RU только как запасной вариант для тестов или аварийного запуска.

## Рекомендуемый сервер

- Ubuntu 22.04 LTS или Ubuntu 24.04 LTS
- 1 vCPU
- 512 MB RAM минимум
- SSH-доступ по ключу
- без панели управления, если нужен самый простой и дешевый вариант

REG.RU поддерживает Linux VPS/облачные серверы с Ubuntu, Debian и готовыми приложениями, включая Node.js. SSH-ключ можно добавить при создании или переустановке облачного сервера.

## Обязательная проверка сети

Перед установкой Node.js, PM2 и проекта проверить доступность Telegram API с самого VPS:

```bash
ssh root@SERVER_IP
curl -I --connect-timeout 10 https://api.telegram.org
```

Если команда зависает, возвращает timeout или отвечает заметно медленно, настройку бота на этом VPS не продолжать.

## Важно перед переносом

Если REG.RU когда-нибудь будет выбран как основной runtime, перед запуском бота на VPS нужно остановить Railway service.

Причина: бот сейчас работает через Telegram polling. Если одновременно запустить два экземпляра с одним `BOT_TOKEN`, они будут конкурировать за updates и могут ловить конфликт polling.

## Что нужно от REG.RU

После создания сервера нужны:

- IP-адрес сервера
- пользователь для SSH, обычно `root`
- пароль или SSH-ключ
- выбранная ОС

## Первичная настройка Ubuntu

Подключиться:

```bash
ssh root@SERVER_IP
```

Обновить систему:

```bash
apt update
apt upgrade -y
```

Поставить базовые пакеты:

```bash
apt install -y git curl ca-certificates build-essential
```

Поставить Node.js 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

Поставить PM2:

```bash
npm install -g pm2
```

## Деплой проекта

Клонировать репозиторий:

```bash
mkdir -p /opt/dom-helper
cd /opt/dom-helper
git clone https://github.com/maver176005/DomHelperBot.git .
```

Установить зависимости:

```bash
npm ci --omit=dev
```

Создать `.env`:

```bash
nano .env
```

Содержимое:

```dotenv
BOT_TOKEN=telegram_bot_token_from_botfather
```

Проверить запуск вручную:

```bash
npm start
```

Если видно `DomHelperBot started`, остановить процесс `Ctrl+C`.

Запустить через PM2:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Команда `pm2 startup` напечатает команду, которую нужно выполнить один раз, чтобы процесс поднимался после перезагрузки сервера.

## Проверка

```bash
pm2 status
pm2 logs dom-helper-bot
```

В логах должно быть:

```text
DomHelperBot started
```

Проверить в Telegram:

```text
/start
```

## Обновление после новых коммитов

На сервере:

```bash
cd /opt/dom-helper
git pull
npm ci --omit=dev
pm2 restart dom-helper-bot
pm2 logs dom-helper-bot
```

## Текущие ограничения

- Основной production runtime сейчас Railway.
- Production data хранится в Railway Postgres через `DATABASE_URL`.
- На VPS без `DATABASE_URL` бот вернется к локальному `data/db.json`.
- РФ VPS может не иметь стабильного исходящего доступа к `api.telegram.org`.
- До использования VPS в production нужно отдельно проверить сеть, storage mode и backup-процедуру.

## Backup локального JSON-хранилища

```bash
cd /opt/dom-helper
mkdir -p backups
cp data/db.json backups/db-$(date +%Y%m%d-%H%M%S).json
```

## Что можно автоматизировать позже

- GitHub Actions deploy по SSH на VPS
- автоматический backup `data/db.json`
- systemd unit вместо PM2
- Postgres на VPS или managed Postgres
