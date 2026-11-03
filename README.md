# Таблетки Евы

Трекер приёма лекарств. Отметки хранятся в Upstash Redis через `api/state.js`.

1. Залить эту папку в GitHub-репозиторий (index.html и папка api в корне).
2. Vercel → Add New → Project → импортировать репозиторий → Deploy.
3. В проекте Vercel: Storage → Create Database → Upstash for Redis (Free) → подключить к проекту.
4. Deployments → последний деплой → Redeploy.

Без шага 3 отметки сохраняются только в браузере (внизу страницы будет предупреждение).
