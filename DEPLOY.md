# DEPLOY.md — «Кейс-баттлы»: деплой на Ubuntu 24.04 и troubleshooting

Прод-стенд: Ubuntu 24.04 · `/opt/casebattles` · Nginx + Certbot (https://edtechbattles.shop) ·
PM2 (fork, процесс `casebattles`) · PostgreSQL 16.

> **v1.2.0 (монетизация Stars):** первая миграция БД со времён v1.0.1 — пайплайн обновления
> меняется (см. А.9): добавлены `prisma migrate deploy` и обязательный перезапуск
> `npm run tg:webhook` (новый allowed_updates `pre_checkout_query` — без него оплаты
> Stars НЕ работают). Перед миграцией сделайте `pg_dump` (раздел В.1).

---

## А. Пайплайн с нуля

> Держите проект ТОЛЬКО в `/opt/casebattles` — не в `/root` (см. Troubleshooting №2).

### 1. Система и Node

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx postgresql postgresql-contrib certbot python3-certbot-nginx
sudo npm i -g pm2
node -v   # ожидание: v20+ (или новее)
```

### 2. PostgreSQL 16: пользователь и база `casebattles`

```bash
sudo -u postgres psql -c "CREATE USER casebattles WITH PASSWORD '<ПАРОЛЬ>';"
sudo -u postgres psql -c "CREATE DATABASE casebattles OWNER casebattles;"
systemctl status postgresql   # active (running)
pg_isready                    # /var/run/postgresql:5432 - accepting connections
```

### 3. Код и зависимости

```bash
sudo mkdir -p /opt/casebattles && sudo chown "$USER" /opt/casebattles
# выгрузите репозиторий в /opt/casebattles (git clone … или scp)
cd /opt/casebattles
npm ci
```

### 4. `.env` (шаблон)

```dotenv
DATABASE_URL=postgresql://casebattles:<ПАРОЛЬ>@localhost:5432/casebattles
NEXT_PUBLIC_APP_URL=https://edtechbattles.shop
BOT_TOKEN=<без пробелов, кавычки допустимы>
WEBAPP_URL=https://edtechbattles.shop
TELEGRAM_WEBHOOK_SECRET=<openssl rand -hex 32>
CRON_SECRET=<openssl rand -hex 32>
APP_SHORT_NAME=<short name Mini App из /newapp>
NEXT_PUBLIC_DEV_MODE=0
```

### 5. База и сборка

```bash
npm run pg:prepare   # pg-схема + prisma generate + migrate deploy + сид контента
npm run build
```

### 6. PM2

```bash
pm2 start npm --name casebattles -- start
pm2 save && pm2 startup   # автозапуск по инструкции, которую напечатает pm2
curl -s http://127.0.0.1:3000/api/health   # {"ok":true,"db":"up"}
```

### 7. Nginx + HTTPS

`/etc/nginx/sites-available/casebattles`:

```nginx
server {
    listen 80;
    listen 443 ssl;
    server_name edtechbattles.shop;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -sf /etc/nginx/sites-available/casebattles /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d edtechbattles.shop
```

### 8. Бот и cron

```bash
npm run tg:webhook            # setWebhook (message+callback_query) + setMyCommands + getMe
sudo bash scripts/setup-cron.sh   # ежедневный daily + каждые 15 мин duels
```

Ручная проверка cron-эндпоинтов (ожидается `{"ok":true,...}`):

```bash
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://edtechbattles.shop/api/cron/daily
curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://edtechbattles.shop/api/cron/duels
```

### 9. Обновление релиза (v1.2.0+)

```bash
# 0) бэкап перед миграцией (первая с v1.0.1!)
sudo -u postgres pg_dump casegames > /root/casegames-$(date +%F).dump

cd /opt/casebattles && git pull
npm ci
npx prisma migrate deploy          # миграция payments (migrate deploy, НЕ db push)
npm run build
pm2 restart casebattles --update-env
npm run tg:webhook                 # ОБЯЗАТЕЛЬНО: allowed_updates + pre_checkout_query
```

Проверьте, что в выводе `tg:webhook` есть строка
`✓ message + callback_query + pre_checkout_query зарегистрированы`.

**Контентные релизы (как добавляется контент):** новые кейсы классики добавляются в
`lib/content/{business,product,law}.ts`, core-кейсы — в `lib/content/core*.ts` (банк в коде,
сид не нужен), подсказки классики — в `CASE_HINTS` в `prisma/seed.ts`. Сид строго аддитивный:
существующие кейсы не обновляются и не удаляются (на них ссылаются Attempt). После выкатки
контентного релиза выполните `npm run db:seed` (входит в pg:prepare при первом деплое) и
проверьте SQL-подсчётом: `SELECT d.title, count(*) FROM "Case" c JOIN "Domain" d ON d.id=c."domainId" GROUP BY 1;`
— ожидается 8 классики на домен (v1.2.1: 24 всего), core считается по конфигам (45).
Самопроверка банка: `npm run selfcheck:content`.

**Генератор и импортёр кейсов (локальный инструмент, v1.2.2):**
запускается на машине разработчика с `~/.z-ai-config` (см. README «AI-движок»):
`npm run cases:generate -- --kind=core --sphere=business --count=3` → ревью черновиков в
`data/case-drafts/` → `npm run cases:import -- --file=...` → коммит `data/*.json` → деплой
(core доезжает с билдом, classic — с ближайшим `pg:prepare`). На проде инструмент не запускается;
никаких прямых записей в прод-БД.

**Живой smoke после выкатки** (реальные Stars, только вручную):
1. В Mini App купите пачку подсказок за Stars → баланс вырос в sheet подсказки.
2. `npm run stars:refund -- <telegram_payment_charge_id>` → в профиле платёж со статусом «возврат».
3. Создайте PRO-инвойс (профиль → PRO) и отмените без оплаты — ничего не должно сломаться.
4. `getWebhookInfo` показывает три типа updates.

**Возврат Stars (ручной инструмент):**
```bash
npm run stars:refund -- <telegram_payment_charge_id>
# косметика отзывается и снимается с экипировки; proUntil/подсказки ретроактивно не отзываются
```

---

## Б. Troubleshooting (реальные кейсы этого деплоя)

### 1. Бот/страницы отдают 404, в HTML подпись `nginx/1.24.0 (Ubuntu)`

Запрос не дошёл до приложения — у nginx потерян `proxy_pass` (типично после правок certbot).

```bash
sudo nginx -T | grep proxy_pass        # пусто или не тот upstream?
sudo cat /etc/nginx/sites-available/casebattles   # сверить блок location
sudo nginx -t && sudo systemctl reload nginx
```

### 2. Turbopack panic: `reading file "/root/.pm2/rpc.sock" — os error 6`

Сборка запущена из каталога внутри `/root`, сканер выходит за границы проекта.
Решение: держать проект в `/opt/casebattles` (см. также блок «Зачистка» ниже).

### 3. noauth-экран «Открой приложение через Telegram»

Это 401 от `/api/app/bootstrap`. Причины по убыванию вероятности:

1. **Исключён `signature` из data-check-string.** Telegram подписывает initData,
   в котором участвует `signature`, исключается только `hash`. Зафиксировано перебором
   8 вариантов на проде (2026-10): реальный хеш совпал только с вариантом
   «декодированные значения + signature участвует + исключён только hash».
   Регресс закрыт тестом `tests/auth-initdata.test.ts` (вектор-ловушка LEGACY).
2. Неверный/устаревший `BOT_TOKEN` в процессе PM2 — `pm2 restart casebattles --update-env`.
3. Часы сервера — `timedatectl` (окно `auth_date` — 24 часа).

### 4. `The Server Reference ID did not match the expected format`

Устаревший/битый `.next`:

```bash
rm -rf .next && npm run build && pm2 restart casebattles
```

### 5. `/api/health` → `{"ok":false,"db":"down"}`

Приложение не достучалось до PostgreSQL:

```bash
systemctl status postgresql
pg_isready
grep DATABASE_URL .env        # postgresql://casebattles:<пароль>@localhost:5432/casebattles
npm run pg:prepare            # при пустой/мигрирующей базе
```

### 6. Разные заголовки в шапке Mini App

Норма Telegram: прямая ссылка `t.me/<bot>/<shortname>` показывает short name приложения,
кнопка `web_app` — имя бота. Не ошибка, чинить не нужно.

---

## В. Ротация BOT_TOKEN (токен засвечен в логах/чатах)

1. @BotFather → `/mybots` → выбрать бота → API Token → `/revoke` (или `/token`) → скопировать новый.
2. На сервере обновить `BOT_TOKEN` в `/opt/casebattles/.env`.
3. `pm2 restart casebattles --update-env`.
4. `cd /opt/casebattles && npm run tg:webhook` (перерегистрирует webhook с тем же секретом).
5. Проверить:
   ```bash
   curl -s https://api.telegram.org/bot<НОВЫЙ_ТОКЕН>/getMe       # {"ok":true,...}
   curl -s https://api.telegram.org/bot<НОВЫЙ_ТОКЕН>/getWebhookInfo  # url + allowed_updates
   ```
6. Старый токен перестаёт работать сразу; открытые Mini App перезапросят авторизацию автоматически.

> Важно: initData подписывается токеном бота. После ротации старые initData невалидны —
> это штатно, окно 24 часа ограничивает последствия.

## Г. Зачистка

1. Убедиться, что рабочая копия одна: `ls /opt/casebattles`.
2. Остатки старой копии в `/root`: посмотрите вручную `ls -la /root` и, если видите
   прежнюю папку проекта (не `.pm2` и не рабочие файлы сервера), удалите её сами
   осознанно. Причина остатков: Turbopack-сканер, запущенный внутри `/root`, читал
   `/root/.pm2/rpc.sock` и падал с `os error 6`. Автоматических `rm -rf` здесь
   намеренно нет — решение и удаление выполняет человек.

## Е. Обслуживание (v1.2.3)

### Ротация логов PM2 (pm2-logrotate)

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 conf pm2-logrotate        # проверка: max_size 10M, retain 14, compress true
```

### Резервное копирование БД

`setup-cron.sh` (v1.2.3) идемпотентно добавляет в root-crontab ежедневный бэкап в 03:00:
`pg_dump casegames | gzip > /root/backups/casegames-<дата>.sql.gz` + удаление дампов
старше 7 дней. Переустановка: `sudo bash scripts/setup-cron.sh` (существующие строки
daily/duels не дублируются); план без записи: `sudo bash scripts/setup-cron.sh --dry-run`.
Проверка: `sudo crontab -l | grep pg_dump` — ровно 1 строка; дампы: `ls -lh /root/backups/`.

### Restore-drill (обязателен: бэкап без проверенного восстановления — не бэкап)

```bash
# 1) свежий дамп → scratch-БД
gunzip -c /root/backups/casegames-<дата>.sql.gz | sudo -u postgres psql casegames_restore
#    (если scratch уже существует: sudo -u postgres dropdb casegames_restore перед этим)

# 2) smoke: счётчики совпадают с продом
sudo -u postgres psql casegames_restore -c 'SELECT count(*) FROM "User";'
sudo -u postgres psql casegames_restore -c 'SELECT count(*) FROM "Payment";'
sudo -u postgres psql casegames_restore -c 'SELECT count(*) FROM "Case";'

# 3) убрать scratch
sudo -u postgres dropdb casegames_restore
```

## Д. Преддеплойная проверка

```bash
npm run deploy-check                 # https, /api/health, getMe, getWebhookInfo
npm run deploy-check -- --start      # + локальный подъём next start
npm test                             # регрессия авторизации (initData)
```
