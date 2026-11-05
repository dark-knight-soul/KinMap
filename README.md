# KinMap

**Семейное древо в одном HTML-файле.** Скачайте файл, откройте двойным кликом — и работайте. Без регистрации, серверов и интернета: древо хранится только у вас.

**A family tree in a single HTML file.** Download it, double-click, done. No sign-up, no servers, no internet — your data stays on your device. [English below ↓](#english)

> ⚠️ Проект в разработке (версия 0.4). Уже работает: схема древа (семья, предки, потомки, веер) с масштабом и поиском, фото с аватарами, биография, проверка ошибок в датах, люди и связи, неточные даты, файл `.kinmap`, пароль на файл, автосохранение, автокопии, отмена (Ctrl+Z). Кнопка «Посмотреть пример» открывает выдуманную семью. План — в [docs/PLAN.md](docs/PLAN.md).

## Что будет уметь

- 🌳 Древо любого размера: повторные браки, приёмные и сводные дети
- 🖼 Фото, даты, места и истории у каждого человека
- 🔗 «Кем приходится» — с точными русскими терминами: деверь, золовка, шурин, сват
- 🖨 Печать на листах A4/A3 с полями для склейки в один плакат, PDF
- 🔄 Импорт и экспорт GEDCOM — перенос из MyHeritage, Geni, Gramps и обратно
- 🔒 Пароль на файл древа, скрытие живых людей при отправке другим
- 📅 Календарь дней рождения и памятных дат
- ✅ Проверка ошибок: «мать младше ребёнка» и т.п.
- 🌓 Русский и английский интерфейс, светлая и тёмная тема

## Как пользоваться

1. Скачайте `KinMap.html` со страницы [Releases](../../releases) *(появится с версией 1.0)*.
2. Откройте его двойным кликом в Chrome, Edge, Firefox или Safari.

Или соберите сами (нужен [Node.js](https://nodejs.org) 20+):

| Что сделать | Windows | macOS / Linux |
|---|---|---|
| Собрать `dist/KinMap.html` | `build.bat` | `./build.sh` |
| Запустить для разработки | `start.bat` | `./start.sh` |

## Для разработчиков

```bash
npm install      # зависимости + подключение git-хука проверки личных данных
npm run dev      # разработка с автообновлением
npm test         # тесты
npm run build    # сборка в dist/KinMap.html
```

Стек: React, TypeScript, Vite, i18next, fflate (zip), Vitest. Сборка в один файл — `vite-plugin-singlefile`. Шифрование и хранилище — встроенные средства браузера (Web Crypto, IndexedDB).

| Папка | Что внутри |
|---|---|
| `src/model` | Данные древа: типы, даты, операции, проверки — без интерфейса, покрыто тестами |
| `src/file` | Формат `.kinmap`, шифрование паролем, открытие/сохранение файлов |
| `src/storage` | Копии и автокопии в браузере (IndexedDB) |
| `src/layout` | Раскладка схемы: потомки, предки, «песочные часы», веер — покрыто тестами |
| `src/state` | Открытое древо, отмена, автосохранение, настройки вида |
| `src/ui` | Экраны и окна |

**Личные данные не коммитим.** Git-хук не пропустит файлы `.kinmap`, `.ged` и фото вне папок `examples/`, `test-data/`, `docs/`. Тестовые семьи — только выдуманные.

---

## English

KinMap is an open-source family tree app that runs entirely in your browser from one HTML file.

**Planned features:** trees of any size (remarriages, adopted and step children), photos and stories, relationship finder (with precise Russian kinship terms), tiled A4/A3 printing to glue into a poster, GEDCOM import/export, password-protected tree files, hiding living people when sharing, anniversaries calendar, data consistency checks, Russian and English UI, light and dark themes.

**Use it:** download `KinMap.html` from [Releases](../../releases) (from v1.0) and open it. **Build it:** `build.bat` / `./build.sh` (Node.js 20+), output in `dist/KinMap.html`.

**Contributing:** `npm install`, `npm run dev`, `npm test`. Never commit real family data — a pre-commit hook blocks tree files and photos outside `examples/`, `test-data/`, `docs/`.

## Лицензия / License

[MIT](LICENSE)
