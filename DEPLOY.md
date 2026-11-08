# Деплой онлайн-режима на VPS

Пошаговая инструкция: от пустого VPS до работающего Telegram Mini App.
Один раз настраиваем сервер (шаги 1–5), дальше обновления — одной командой
`deploy/deploy.sh` (шаг 6).

Что получится: участники открывают Mini App по ссылке `t.me/<бот>/<app>`,
фасилитатор создаёт сессию, зал смотрит проектор по адресу
`https://<домен>/projector`.

## 0. Что понадобится

- **VPS**: Ubuntu 24.04, хватает 1 CPU / 1 ГБ RAM / 5 ГБ диска.
- **Домен** с A-записью на IP VPS (например `retro.example.com`).
- **Токен бота** от @BotFather.
- SSH-доступ на VPS.

## 1. BotFather (можно параллельно с сервером)

1. `/newbot` → имя + логин → получаем **токен** (`BOT_TOKEN`).
2. Привязываем домен Mini App: `/mybots` → бот → *Bot Settings* →
   *Menu Button* / *Configure Web App* → URL `https://<домен>` (HTTPS
   обязателен, домен должен уже резолвиться — сертификат добавим на шаге 4).
3. Задаём короткое имя Mini App для прямой ссылки: *Bot Settings* →
   *Configure Mini App URL* → short name, например `app`. Итоговая
   ссылка для участников: `t.me/<бот>/app`, для фасилитатора —
   `t.me/<бот>` (кнопка Menu).

Webhook сервер регистрирует **сам при старте** (`setWebhook` на
`PUBLIC_URL/bot` с секретным заголовком), вручную ничего не настраиваем.

## 2. Подготовка VPS (один раз)

```bash
# Пользователь и каталог приложения
sudo useradd --system --create-home --home-dir /home/retro retro
sudo mkdir -p /opt/retro /var/lib/retro && sudo chown retro:retro /var/lib/retro

# Bun 1.4.x — runtime и единственная зависимость сервера
sudo -u retro bash -c 'curl -fsSL https://bun.sh/install | bash'

# Env с секретами (шаблон — deploy/env.example)
sudo mkdir -p /etc/retro && sudo cp deploy/env.example /etc/retro/env
sudoedit /etc/retro/env   # BOT_TOKEN, BOT_WEBHOOK_SECRET, PUBLIC_URL, BOT_USERNAME, APP_SHORT_NAME
sudo chmod 600 /etc/retro/env

# systemd-unit (шаблон — deploy/retro.service)
sudo cp deploy/retro.service /etc/systemd/system/retro.service
sudo systemctl daemon-reload
```

Секрет для webhook: `openssl rand -hex 32`.

## 3. nginx

```bash
sudo apt install -y nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/retro
# в файле заменить server_name retro.example.com на свой домен
sudo ln -s /etc/nginx/sites-available/retro /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Bun слушает `127.0.0.1:8787`, наружу смотрит только nginx.
Файрвол: `sudo ufw allow 'Nginx Full' && sudo ufw enable` — порт 8787
наружу не открываем.

## 4. TLS (certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d retro.example.com
```

Certbot сам перепишет конфиг на 443 + редирект с 80. Обновление
сертификатов — автоматически (systemd-таймер certbot).

## 5. Первый деплой

С локальной машины (в репозитории, после `bun install`):

```bash
./deploy/deploy.sh retro@retro.example.com /opt/retro
```

Скрипт собирает клиентов (`bun run build:tma`), копирует репозиторий на
VPS (без `.git`/`node_modules`), рестартит `retro.service` и проверяет
`/healthz`. База sqlite создаётся сама при первом старте.

Проверка:

```bash
journalctl -u retro -f                    # логи
curl https://<домен>/healthz             # {"ok":true}
curl https://<домен>/projector           # страница проектора
# открыть в браузере https://api.telegram.org/bot<TOKEN>/getWebhookInfo —
# url должен быть https://<домен>/bot
```

Создайте сессию из Mini App в Telegram — ссылку для участников бот
печатает прямо в чат фасилитатора (`t.me/<бот>/<app>?startapp=<код>`).

## 6. Обновления (каждый следующий деплой)

```bash
./deploy/deploy.sh retro@retro.example.com /opt/retro
```

Одна команда: сборка → rsync → рестарт → healthcheck.
Если что-то сломалось: `ssh retro@<хост> sudo systemctl rollback` нет —
у systemd нет rollback; `deploy.sh` идемпотентен, просто запустите
предыдущую версию ещё раз из нужного коммита.

## Структура продакшена

```
/etc/retro/env                # секреты (BOT_TOKEN, webhook-secret, URL'ы)
/etc/systemd/system/retro.service
/etc/nginx/sites-available/retro
/var/lib/retro/retro.db       # sqlite: сессии, игроки, ответы
/opt/retro/                   # репозиторий (rsync из deploy.sh)
/opt/retro/server/public/     # собранные Mini App и проектор
```

Бэкап состояния — копия `/var/lib/retro/retro.db` (sqlite, один файл;
серверу для бэкапа достаточно `systemctl stop retro` или
`sqlite3 retro.db ".backup ..."` на живую).

## Проверки после деплоя (чек-лист)

- [ ] `getWebhookInfo` — `url` = `https://<домен>/bot`, `last_error` пустой
- [ ] `t.me/<бот>` открывает Mini App (кнопка Menu)
- [ ] фасилитатор создаёт сессию → бот печатает ссылку с кодом
- [ ] участник по ссылке попадает в лобби, имя подтянулось из профиля Telegram
- [ ] `/projector` в браузере показывает лобби после ввода кода
- [ ] игра целиком: ответы → таймер → результаты на проекторе
- [ ] проектор и участники переживают перезапуск сервера (sqlite, реконнект WS)
