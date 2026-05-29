# PartScan AI

MVP для каталогизации автомобильных деталей через камеру телефона. Приложение отдаёт Telegram Mini App-friendly web-интерфейс, отправляет фото детали в OpenAI Vision API, сохраняет результат в базу и показывает последние распознанные детали.

## Возможности MVP

- камера в браузере/Telegram Mini App;
- подсказки по освещению кадра;
- распознавание детали, маркировок, категории, состояния и возможных автомобилей;
- сохранение результата в PostgreSQL через Spring Data JPA;
- список последних 50 сохранённых деталей.

## Переменные окружения

```bash
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.0-flash
DB_URL=jdbc:postgresql://host:5432/db
DB_USERNAME=...
DB_PASSWORD=...
```

Без `DB_URL` приложение запускается на in-memory H2, что удобно для локальной проверки.
На Railway можно также использовать стандартные переменные Postgres-плагина `DATABASE_URL` или `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`.
Если OpenAI возвращает `insufficient_quota`, приложение попробует Gemini fallback при наличии `GEMINI_API_KEY`.

## Локальный запуск

```bash
cd backend
./gradlew bootRun
```

После запуска откройте `http://localhost:8080`.
