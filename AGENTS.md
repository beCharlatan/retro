# AGENTS.md — «5 минут общего развития» (retro)

Файл для ИИ-агентов, работающих с этим репозиторием. Основная документация —
`README.md` (архитектура, паттерны, «как добавить игру») и `test/README.md`
(тестовый набор) — на русском, на нём же написан и этот файл.

## Обзор проекта

Веб-платформа с 21 мини-экспериментом (когнитивные искажения, экономика /
теория игр, социальная психология) для командных встреч и ретро. Ведущий
(фасилитатор) вводит данные за всю команду, зал смотрит «экран для показа»
(второе окно для шеринга в Zoom). Язык интерфейса — русский.

Ключевой факт: **офлайн-продукт — один самодостаточный файл `dist/index.html`**.
Он собирается из `src/` и открывается двойным кликом в браузере, без сервера
и без сети. Пользователю передаётся только он.

С Этапа 1 (2026-11) рядом существует **онлайн-режим** (`server/` + `clients/`):
участники отвечают сами через Telegram Mini App, состояние сессии живёт на
сервере (Bun + WebSocket + bun:sqlite). Офлайн-файл при этом не меняется —
онлайн-режим аддитивен. Этап 1 — 4 solo-игры; Этап 2 добавил пары/группы,
двухраундовые игры, раздачу в личку ботом и синхронные таймеры
(всего 8 игр, `server/games/`).

## Технологический стек

- **Bun 1.4.x** — runtime, пакетный менеджер и сборщик (`Bun.build()`).
  Сборка только через Bun, не через node (см. `build.js`, `scripts/dev-server.js`).
- **Lit 3** — все игры и главный экран — Web Components (`LitElement`,
  Shadow DOM, декларативные `html``` шаблоны, реактивные `static properties`).
  `lit` импортируется голым bare-специфайером (`import ... from 'lit'`),
  поэтому исходники нельзя открыть без бандлера (см. «Разработка» ниже).
- **D3 7** — SVG-графики результатов (`src/charts/`).
- **html-to-image** — растеризация PNG-отчётов; **sharp** — иконки и
  подготовка скриншотов в визуальных тестах.
- **Playwright** — E2E-регрессия; **@axe-core/playwright** — доступность;
  **fast-check** — property-тесты; **Biome 2.5** — lint + форматирование.

Зависимости (prod): `lit`, `d3`, `html-to-image`. Всё остальное — devDependencies.

## Команды

```bash
bun install           # зависимости + автоматически ставит pre-push git-хук
bun run dev           # dev-сервер на http://localhost:5173 (обязателен для src/, см. ниже)
bun run build         # Bun.build() из src/app.js + styles.css → dist/index.html (минимизированный)
bun run test          # полный E2E-набор против СОБРАННОГО dist/index.html (~12 мин, ~1460 проверок)
bun run test:unit     # юниты + property-тесты (bun:test, ~1 с)
bun run test:visual   # визуальная регрессия PNG-отчётов (Playwright Test)
bun run test:visual:update  # перезаписать эталоны
bun run lint          # biome check . (ошибки падают, предупреждения — нет)
bun run lint:fix      # biome check --write .
bun run format        # biome format --write .
bun run verify        # lint + lint:undeclared + build + test + test:unit — полный локальный гейт
bun run icons         # перегенерировать src/icon-assets.js из src/icons/*.png (нужен sharp)

# Онлайн-режим (Telegram Mini App)
bun run build:tma     # clients/{tma,projector} → server/public/{index,projector}.html
bun run server        # build:tma + поднять сервер (http://localhost:8787, /ws, /projector)
bun run test:server   # тесты онлайн-режима (test/server/, bun:test; cwd — test/server/)
```

Переменные окружения сервера: `BOT_TOKEN`, `PUBLIC_URL`, `BOT_USERNAME`,
`APP_SHORT_NAME` (Telegram, прод), `PORT`, `DB_PATH`. Без `BOT_TOKEN` сервер
работает в dev-режиме: auth принимает конверт `{dev:true,user:{...}}`
(в клиенте — `?dev=Имя`), deep-link — `http://localhost:<port>/?join=<код>`.

Части E2E-набора: `bun run test:smoke|home|persistence|export|a11y|projector|...`
(список — в `package.json`, раннер — `test/run-all.js --only=<набор>`).

### ⚠️ Подводные камни команд

- **Никогда не запускайте голый `bun test`** — встроенный раннер Bun найдёт
  `test/*.spec.js` (совпадающий glob), не выполнит их и тихо покажет
  «0 pass / 0 fail». E2E — только `bun run test`. `bunfig.toml` специально
  уводит `bun test` в `test/unit/`, чтобы такая попытка падала явно.
- E2E гоняет именно **собранный** `dist/index.html` — перед `bun run test`
  нужен `bun run build` (или `bun run verify`).
- `dist/index.html` и `src/icon-assets.js` — **сгенерированные файлы,
  руками не править**: первый — через `bun run build`, второй —
  через `bun run icons`.

## Структура кода (`src/`)

Редактируем только здесь. Настоящие ES-модули.

- `app.js` — точка входа (boot вызов главной); `index.html` — dev-обёртка.
- `state.js` — app-wide состояние: список игр `GAMES` (21 игра), фильтры,
  `state.players` / `state.participants`, аватары.
- `players-store.js` / `players-admin.js` — команда хранится в
  `localStorage` (`retro.players.v1`), редактируется панелью «Игроки».
  Имён в коде нет; игры читают `state.participants`.
- `router.js` — `openGame(id)` монтирует `<retro-game-<id>>` в `#app`
  (карта `id → тег` — `GAME_TAGS`, импорты игр — side-effect).
- `home.js` + `map-render.js` — главный экран: фильтры, карточки, карта
  (canvas/DOM, камера, физика иконок — `logic/map-physics.js`).
- `games/` — 21 файл, по одному Lit-компоненту на игру (`<retro-game-...>`).
- `logic/` — **чистая логика без DOM** (подсчёт результатов, статистика,
  ввод данных, таймеры, цвета/форматирование, фильтры). Сюда выносятся
  вычисления из компонентов — с юнит-тестом в `test/unit/`. Поле `null`
  означает «недостаточно данных», не `NaN`.
- `controllers/` — Lit ReactiveController'ы: проход по раундам, таймеры,
  спойлеры, D3-графики после рендера, проектор. Сами чистят таймеры/
  слушатели при отключении.
- `charts/` — общий D3-кит (тема, оси, подсказки) + типы графиков
  (swarm, bars, scatter, intervals, lines).
- `content/` + `content.js` — тексты игр в JSON (по файлу на игру):
  `intro` (реплики ведущего), `rules` (для игроков, идут на проектор),
  `context`, `facts`. Правятся без JS; разрешены только `<b>`, `<i>`, `<br>`
  и известные `{плейсхолдеры}` (проверки — `test/unit/content.test.js`).
- `projector/` — «экран для показа»: второе окно, связь через
  `window.postMessage` (работает и с `file://`), санитизация снимков.
  На проектор уходит **только** явно помеченное `data-projector="..."`.
- Общие паттерны игр: `game-shell.js` (каркас, выход с подтверждением),
  `game-trail.js` (тропа шагов + акцентные CSS-переменные игры),
  `persist.js` (черновики в `sessionStorage` на время вкладки),
  `report-export.js` (экспорт результатов в PNG 1080px@2x),
  `roles.js` (чистые makePairs/makeGroups/swap*), `dispatch.js` (раздача
  в личку), `leaderboard.js`, `spoiler-card.js`, `chart-tip.js`,
  `styles/shared-styles.js` (весь `styles.css` как Lit `css` для Shadow DOM).

Единая драматургия каждой игры: инструкция и правила **без спойлеров**
(без названия эффекта и авторов) → [распределение ролей] → [раздача в
личку] → сбор данных фасилитатором → результаты команды → [итоговая
таблица] → контекст/история → экспорт в PNG.

## Онлайн-режим (`server/`, `clients/`, `test/server/`)

Этап 1 (MVP): сессии + 4 solo-игры (`anchoring`, `planning-fallacy`,
`crowd-wisdom`, `availability`). Сервер — источник правды, вся математика —
те же чистые модули `src/logic/`, клиенты тонкие.

- `server/index.js` — `Bun.serve()`: статика из `server/public/`
  (**сгенерировано**, `bun run build:tma`), POST `/bot` (webhook),
  WebSocket `/ws`. `server/config.js` — env, `db.js` — bun:sqlite
  (sessions/players/answers), `session.js` — фазы lobby→collect→results,
  `ws.js` — хаб комнат и маршрутизация, `auth.js` — HMAC initData
  (без BOT_TOKEN — dev-конверт), `bot.js` — webhook и кнопки Mini App,
  `protocol.js` — нормализация сообщений и снимка.
- `server/games/<id>.js` — декларации: поля формы, `validateRound` (клэмп как
  в `logic/entries.js`, patch мержится в payload участника), `flatten`
  (payload→плоские ключи формы), `compute` (через `src/logic/`), `headline`/
  `detail`. Константы вопросов продублированы из `src/games/<id>.js` — те
  не могут исполняться на сервере (регистрация custom elements при
  импорте); при правке формулировок синхронизировать. Контракт (дефолты —
  `withDefaults` в `games/index.js`): `structure` (solo/pairs/groups/team),
  `rounds`, `assignment` (makePairs/makeGroups/splitMarket из `src/logic`,
  хранится в meta и переживает рестарт), `fieldsFor(round, ctx)`,
  `roundFilled`, `complete` (гейт reveal), `roster`, `myInfo`, `recap`
  (сводки прошлых раундов — фасилитатор и проектор), `anonymous`
  (проектору — только суммы без имён: «Диктатор», «Общественное благо»),
  `dispatchText`, `timerSeconds`. 19 из 21 игр; **dollar-auction и
  beer-game онлайн не реализованы** (живые механики не вписываются в
  форму ответа) — остаются офлайн-играми.
- **Снимки ролевые** (`ws.js`): фасилитатор — всё (строки с flat-копией для
  правки, только однораундовые игры); участник — только свой срез (свои поля
  текущего раунда, своя роль/пара, свои ответы) — чужие ответы не покидают
  сервер до reveal; проектор — публичное (roster, живые строки, таймер,
  результаты), без форм. Таймер advisory: сервер хранит дедлайн, все
  считают от него, на нуле — broadcast 'done', ответы не блокируются.
- `clients/tma/` — единый Mini App-клиент (роль по способу входа: без кода —
  фасилитатор, `?join=КОД`/`start_param` — участник). Vanilla JS, токены
  дизайн-системы из `src/styles.css`. `clients/projector/` — экран для
  зала по роли `projector` (без Telegram, просто страница `/projector`).
- `test/server/` — bun:test; `e2e.test.js` поднимает настоящий сервер
  субпроцессом и гоняет полный сценарий по WS. Запуск — `bun run test:server`
  (cwd — `test/server/`: `bunfig.toml` уводит голый `bun test` в `test/unit/`).

## Стиль кода

Biome (`biome.json`): отступы — 2 пробела, одинарные кавычки, ширина строки
100, пресет `recommended`, автоорганизация импортов (`assist`). Формат и
lint гоняются по всему репо кроме `dist/`. Отдельная проверка
`bun run lint:undeclared` (Biome `noUndeclaredVariables`) ловит переименованные
константы, которые бандлер пропустит.

Соглашения, принятые в коде (не менять без причины):

- Компоненты — Lit с Shadow DOM; общий `styles.css` подключается целиком как
  `sharedStyles` (обоснование — в шапке `src/styles/shared-styles.js`).
- Все поля ввода получают `aria-label` с именем участника — иначе падает
  `a11y.spec.js` (axe-core, WCAG 2 A/AA + best-practice).
- Акцентный цвет игры — в CSS-переменных `--game-accent*` из `game-trail.js`,
  контраст текста ≥ 4.5:1 (`logic/color.js`).
- Имена на проекторе — только в составах (`roster`) и открытых по сути игре
  данных; всё, что уходит в личку, не помечается никогда.
- Дизайн-система: бумажный фон в линейку, Fraunces (заголовки), IBM Plex Sans/
  Mono, один акцентный цвет на категорию.

## Тестирование

Два намеренно разделённых слоя (комментарий в `bunfig.toml`):

1. **E2E, `test/*.spec.js`** — свой лёгкий раннер `test/run-all.js` поверх
   голого Playwright против собранного `dist/index.html`. Каждая игра целиком,
  карта, черновики, экспорт PNG, графики, таймеры, доступность, проектор,
   приватность. Описание всех игр для набора — централизовано в `test/games.js`
   (один объект на игру); наборы `smoke`/`persistence`/`export`/`a11y` подхватывают
   новую игру автоматически, `CHARTS` в `charts.spec.js` — график результатов,
   число игр в категории «Социальная психология» захардкожено в `home.spec.js`
   (`SOCIAL_GAMES`).
2. **Юниты, `test/unit/*.test.js`** — настоящий `bun:test` (describe/test/expect)
   для чистой логики `src/logic/`, включая property-тесты fast-check в
   `test/unit/properties/`. Запуск — только `bun run test:unit`.

Визуальная регрессия (`test/visual/`, Playwright Test): скачанный PNG-отчёт
каждой игры сравнивается с эталоном в `test/visual/__snapshots__/<платформа>/`.
Эталоны зависят от ОС (системные шрифты) — коммитятся под `darwin/` и `linux/`.
На ОС без эталонов первый запуск падает — записать: `bun run test:visual:update`.
Эталоны есть не для всех игр (см. `test/README.md`). WebKit: `bun run test:webkit`;
наборы с буфером обмена в WebKit не работают, часть проверок там падает
(документировано в `test/README.md`, не считается регрессией).

Добавление новой игры — пошагово в `README.md` («Как добавить новую игру»):
`src/games/<id>.js` (Lit-компонент), `src/content/<id>.json`, запись в `GAMES`
(`src/state.js`), импорт и `GAME_TAGS` (`src/router.js`), объект в `test/games.js`,
иконка (`bun run icons`) + `ICON_COLORS` в `src/map-render.js`. Источник правды
по механике/формулам — `spec/game_platform_spec.md`, фактура второй партии —
`docs/new-games/<id>.md`.

## CI, хуки, распространение

- **CI** — `.github/workflows/verify.yml`, четыре параллельных джоба на каждый
  pull request: `static` (biome + undeclared + юниты), `e2e` (build + полный набор,
  артефакт `dist/index.html`), `server` (онлайн-режим: сборка клиентов + тесты
  `test/server/`), `visual` (только если для платформы раннера
  записаны эталоны; запись Linux-эталонов — ручной `workflow_dispatch`).
- **pre-push git-хук** (`scripts/pre-push`, ставится через `postinstall`):
  build + smoke-набор (~15–20 с). Пропустить разово: `git push --no-verify`.
  Полный гейт всё равно гоняется в CI.
- **Деплой офлайн-режима** — передать пользователю `dist/index.html`
  (двойной клик; проектор работает и с `file://`). В CI собранный файл
  прикладывается как артефакт.
- **Деплой онлайн-режима** — VPS + nginx (TLS, certbot) + systemd,
  инструкция и шаблоны в `DEPLOY.md` и `deploy/` (`deploy.sh` —
  сборка + rsync + рестарт + healthcheck одной командой). Серверу на
  VPS нужен только Bun: runtime-зависимостей из `node_modules` нет
  (клиенты собираются в `server/public/` заранее). Webhook Telegram
  (`POST /bot`, секретный заголовок) сервер регистрирует сам при
  старте по `PUBLIC_URL`.
- `test/lib.js` включает тестовый флаг `window.__RETRO_TEST__` — только с ним
  создаётся хук `window.__reportData` для проверки PNG-отчётов.
