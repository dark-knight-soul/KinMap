# Как помочь проекту / Contributing

Спасибо, что хотите помочь KinMap! / Thanks for helping KinMap!

## Главное правило: никаких настоящих данных

**Не прикладывайте к задачам и не коммитьте настоящие древа, GEDCOM-файлы и семейные фото** — это личные данные живых людей.

- Для примеров используйте выдуманные семьи. Пример открывается ссылкой `KinMap.html#demo`.
- Тестовые файлы — только в `test-data/` и `examples/`, люди в них — выдуманные.
- Git-хук (`.githooks/pre-commit`, подключается при `npm install`) не пропустит файлы `.kinmap`, `.ged` и фото вне `examples/`, `test-data/`, `docs/`, `src/assets/`, `public/`.

**Never attach or commit real family trees, GEDCOM files or family photos** — they contain personal data of living people. Use fictional families only (`KinMap.html#demo`).

## Разработка / Development

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run typecheck
npm run build      # dist/KinMap.html
```

## Соглашения / Conventions

- TypeScript со строгой проверкой; логика (`src/model`, `src/layout`, `src/gedcom`, `src/print`, `src/file`) — без интерфейса и с тестами.
- Комментарии в коде — на русском (так принято в проекте). Code comments are in Russian — feel free to write English in issues and PRs.
- Все тексты интерфейса — в `src/i18n/ru.ts` и `src/i18n/en.ts` (тест проверяет, что ключи совпадают).
- Минимум зависимостей: всё приложение собирается в один файл, каждый килобайт на счету.
- Перед PR: `npm test` и `npm run build` проходят.

## Сообщить об ошибке / Report a bug

[Создайте задачу](../../issues/new/choose): что делали, что ожидали, что получилось, браузер. Если ошибка в импорте GEDCOM — опишите, из какой программы файл, и приложите **выдуманный** фрагмент, который повторяет проблему.
