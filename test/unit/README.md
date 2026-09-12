# Юнит-тесты (`bun test`)

Второй, более быстрый слой тестов — в дополнение к Playwright E2E
(`test/*.spec.js`, см. `test/README.md`). Здесь живут `bun:test`-тесты
(`describe`/`test`/`expect`) на **чистую логику без DOM и без
браузера** — вещи вроде `Roles.makePairs`/`makeGroups`/`swapInPairs`/
`swapInGroups`, подсчёт средних/дельт в результатах игр и т.п.

Запуск: `bun run test:unit` (или бинарно `bun test` — `bunfig.toml` в
корне репозитория указывает `[test] root = "test/unit"`, поэтому
голый `bun test` смотрит только сюда и не путается с
`test/*.spec.js`, которые устроены иначе).

Появится начиная с Фазы 1 плана миграции (`docs/modernization-plan.md`)
— как только `roles.js` и другие общие модули получат настоящий
`export`, их станет можно импортировать сюда напрямую.

Пока эта папка пуста, `bun run test:unit` завершается с ошибкой «0
test files» — это ожидаемо и поэтому `test:unit` **не** включён в
`verify` в package.json. Добавить его в `verify` нужно в том же
коммите, где здесь появится первый настоящий `*.test.js`.
