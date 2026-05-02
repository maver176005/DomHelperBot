# REG_RU_DEPLOYMENT.md

План переноса Telegram-бота с Railway на VPS в REG.RU.

Лендинг остается на GitHub Pages. На REG.RU запускается только Node.js бот.

## Рекомендуемый сервер

- Ubuntu 22.04 LTS или Ubuntu 24.04 LTS
- 1 vCPU
- 512 MB RAM минимум
- SSH-доступ по ключу
- без панели управления, если нужен самый простой и дешевый вариант

REG.RU поддерживает Linux VPS/облачные серверы с Ubuntu, Debian и готовыми приложениями, включая Node.js. SSH-ключ можно добавить при создании или переустановке облачного сервера.

## Важно перед переносом

Перед запуском бота на VPS нужно остановить Railway service.

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

- Данные пока пишутся в `data/db.json` на VPS.
- Это надежнее, чем ephemeral filesystem Railway, но все еще не полноценная БД.
- Следующий технический шаг остается прежним: подключить Postgres.
- До подключения БД нужно делать backup `data/db.json`.

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
