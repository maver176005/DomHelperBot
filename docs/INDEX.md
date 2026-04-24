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

## Почему source-of-truth файлы не переносились в `docs/`

- `PROJECT.md` и `TASK.md` уже используются как внешние опорные документы
- перенос сейчас дал бы больше шума, чем пользы
- `docs/` добавлен как слой навигации, а не как новая истина
