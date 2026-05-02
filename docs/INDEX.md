# docs/INDEX.md

Главная точка входа в документацию проекта.

## Читать в таком порядке

1. [PROJECT.md](/Users/mac/WebstormProjects/DomHelperBot/PROJECT.md)
   Источник истины по продукту и бизнес-правилам.

2. [TASK.md](/Users/mac/WebstormProjects/DomHelperBot/TASK.md)
   Исходная постановка текущего MVP.

3. [README.md](/Users/mac/WebstormProjects/DomHelperBot/README.md)
   Запуск, локальная проверка и пользовательский сценарий.

4. [PROJECT_MAP.md](/Users/mac/WebstormProjects/DomHelperBot/PROJECT_MAP.md)
   Карта файлов и быстрый способ понять, где какая логика лежит.

5. [STATUS.md](/Users/mac/WebstormProjects/DomHelperBot/STATUS.md)
   Что уже реализовано, что упрощено и какой есть техдолг.

6. [DECISIONS.md](/Users/mac/WebstormProjects/DomHelperBot/docs/DECISIONS.md)
   Почему проект сейчас устроен именно так.

7. [GTM.md](/Users/mac/WebstormProjects/DomHelperBot/docs/GTM.md)
   Черновик запуска через объявление и QR в подъезде.

8. [LESSONS.md](/Users/mac/WebstormProjects/DomHelperBot/docs/LESSONS.md)
   Журнал самообучения: ошибка, урок, новое правило после исправлений.

9. [DEPLOYMENT.md](/Users/mac/WebstormProjects/DomHelperBot/docs/DEPLOYMENT.md)
   Полный цикл GitHub Actions и Railway autodeploy.

10. [NEXT_SESSION.md](/Users/mac/WebstormProjects/DomHelperBot/docs/NEXT_SESSION.md)
    Первый шаг следующей сессии: подключить постоянную БД.

11. [DATABASE_PLAN.md](/Users/mac/WebstormProjects/DomHelperBot/docs/DATABASE_PLAN.md)
    План миграции с `data/db.json` на Railway Postgres.

12. [landing/index.html](/Users/mac/WebstormProjects/DomHelperBot/landing/index.html)
    Статический лендинг, объясняющий пользу бота для жильцов дома.

13. [REG_RU_DEPLOYMENT.md](/Users/mac/WebstormProjects/DomHelperBot/docs/REG_RU_DEPLOYMENT.md)
    Инструкция переноса бота на VPS в REG.RU.

## Практическая навигация

- Хочешь понять продукт:
  открывай `PROJECT.md`

- Хочешь понять текущее состояние:
  открывай `STATUS.md`

- Хочешь найти код:
  открывай `PROJECT_MAP.md`, потом `src/index.js`

- Хочешь менять архитектуру:
  сначала смотри `docs/DECISIONS.md`

- Хочешь понять, что запланировано после Telegram MVP:
  открой `STATUS.md`

- Хочешь продумать запуск по домам:
  открой `docs/GTM.md`

- Хочешь понять, какие ошибки уже превращены в правила:
  открой `docs/LESSONS.md`

- Хочешь настроить деплой:
  открой `docs/DEPLOYMENT.md`

- Переносишь бота с Railway на REG.RU:
  открой `docs/REG_RU_DEPLOYMENT.md`

- Начинаешь новую рабочую сессию:
  открой `docs/NEXT_SESSION.md`

- Подключаешь постоянную БД:
  открой `docs/DATABASE_PLAN.md`

- Нужно показать продукт жильцу или старшему по дому:
  открой `landing/index.html`

## Почему source-of-truth файлы не переносились в `docs/`

- `PROJECT.md` и `TASK.md` уже используются как внешние опорные документы
- перенос сейчас дал бы больше шума, чем пользы
- `docs/` добавлен как слой навигации, а не как новая истина
