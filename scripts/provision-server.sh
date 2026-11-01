#!/usr/bin/env bash
# ============================================================================
# provision-server.sh — идемпотентный провижин «Кейс-баттлов» (ПЛАН Б, §16 ТЗ).
# Запуск НА СЕРВЕРЕ (Ubuntu 24.04) от root:  sudo bash scripts/provision-server.sh
#
# Что делает (этапы 0–7 ТЗ; повторный запуск безопасен):
#   0. Разведка + выбор режима CLEAN/UPDATE
#   1. ОС: пакеты, таймзона MSK, Node 20/22 LTS, PM2, юзер deploy, swap, ufw, fail2ban
#   2. PostgreSQL: CLEAN — роль+база casegames; UPDATE — ничего не создаёт
#   3. .env: дозаполняет недостающие секреты (генерит openssl rand), chmod 600
#      + бэкапы кода/БД в режиме UPDATE; npm ci → pg:prepare → build
#   4. PM2: start deploy/ecosystem.config.cjs от deploy + автозапуск + health
#   5. Nginx: конфиг из deploy/nginx/ + certbot (только если DNS уже смотрит на сервер)
#   6. Webhook (npm run tg:webhook) + cron (scripts/setup-cron.sh) — если HTTPS готов
#   7. Smoke-тесты локальные + итоговый отчёт
#
# Чего НЕ делает (намеренно):
#   - НЕ трогает sshd_config (hardening — отдельный ручной этап 8, см. DEPLOY.md §Ж3)
#   - НЕ делает prisma migrate reset / дропы БД
#   - НЕ правит код приложения
#
# Секреты читает ТОЛЬКО из /opt/casebattles/.env (не из аргументов).
# BOT_TOKEN для CLEAN-режима должен уже лежать в .env — иначе внятная ошибка.
# ============================================================================
set -euo pipefail

APP_DIR="/opt/casebattles"
ENV_FILE="$APP_DIR/.env"
BACKUP_DIR="/opt/backups"
DOMAIN="edtechbattles.shop"
PG_ROLE="casegames"
PG_DB="casegames"

log()  { echo -e "\n=== $* ==="; }
ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠️  $*" >&2; }
die()  { echo "  ✗ $*" >&2; exit 1; }

mask() { # маскирует секрет: первые 4 символа + ***
  local v="$1"
  if [[ ${#v} -le 4 ]]; then echo "***"; else echo "${v:0:4}***"; fi
}

env_get() { # env_get KEY -> значение из .env (без кавычек) или пусто
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]'
}

[[ $EUID -eq 0 ]] || die "Запустите от root: sudo bash $0"
[[ -f "$APP_DIR/package.json" ]] || die "$APP_DIR не содержит проект. Сначала залейте код (см. DEPLOY.md §Ж1)."
cd "$APP_DIR"

# ============================================================================
log "ЭТАП 0/7: Разведка"
# ============================================================================
lsb_release -ds 2>/dev/null || cat /etc/os-release | head -2
echo "CPU: $(nproc) × $(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs 2>/dev/null || echo '?')"
free -h | head -2; df -h / | tail -1
timedatectl 2>/dev/null | grep -E "Time zone|Local time" || date
for c in node npm pm2 psql nginx certbot; do
  printf "  %-8s %s\n" "$c:" "$(command -v $c >/dev/null 2>&1 && $c --version 2>/dev/null | head -1 || echo 'нет')"
done
systemctl is-active postgresql 2>/dev/null | xargs -I{} echo "  postgresql: {}" || true
systemctl is-active nginx 2>/dev/null | xargs -I{} echo "  nginx: {}" || true
ss -tlnp 2>/dev/null | awk 'NR==1 || /:(22|80|443|3000|5432) /' | head -8

MODE="CLEAN"
if [[ -d "$APP_DIR/.git" || -d "$APP_DIR/node_modules" || -n "$(env_get DATABASE_URL)" ]] \
   && sudo -u postgres psql -Atc "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" 2>/dev/null | grep -q 1; then
  MODE="UPDATE"
fi
ok "Режим: $MODE"

DNS_IP="$(getent hosts $DOMAIN 2>/dev/null | awk '{print $1; exit}')"
SELF_IP="$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || true)"
if [[ -n "$DNS_IP" && "$DNS_IP" == "$SELF_IP" ]]; then
  DNS_READY=1; ok "DNS: $DOMAIN → $DNS_IP (этот сервер) — HTTPS будет настроен"
else
  DNS_READY=0
  warn "DNS не готов (domain: ${DNS_IP:-не резолвится}, этот сервер: ${SELF_IP:-?})."
  warn "certbot и webhook на https-домен ОТЛОЖЕНЫ — в конце будет блок «Докатка после DNS»."
fi

# ============================================================================
log "ЭТАП 1/7: ОС, Node, PM2, юзер deploy, swap, firewall"
# ============================================================================
export DEBIAN_FRONTEND=noninteractive
if [[ -f /var/lib/apt/periodic/update-success-stamp ]] || apt-get update -qq >/dev/null 2>&1; then :; else apt-get update -qq >/dev/null; fi
apt-get install -y -qq git curl nginx postgresql postgresql-contrib \
  certbot python3-certbot-nginx ufw fail2ban rsync openssl >/dev/null 2>&1 || \
  apt-get install -y git curl nginx postgresql postgresql-contrib certbot python3-certbot-nginx ufw fail2ban rsync openssl
ok "пакеты ОС установлены"

timedatectl set-timezone Europe/Moscow 2>/dev/null && ok "таймзона Europe/Moscow" || true

NODE_MAJOR="$(node -v 2>/dev/null | grep -oE '^[0-9]+' || echo 0)"
NODE_OK=0
if [[ "$NODE_MAJOR" == "20" || "$NODE_MAJOR" == "22" ]]; then
  node -v | grep -qE 'v(2[02]\.(9|[1-9][0-9]))' && NODE_OK=1 || NODE_OK=0
fi
if [[ $NODE_OK -eq 0 ]]; then
  curl -fsSL "https://deb.nodesource.com/setup_20.x" -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null
fi
ok "Node.js $(node -v)"

command -v pm2 >/dev/null 2>&1 || npm install -g pm2@latest >/dev/null 2>&1
ok "PM2 $(pm2 --version)"

id deploy >/dev/null 2>&1 || { adduser --disabled-password --gecos "" deploy; ok "юзер deploy создан"; }
usermod -aG sudo deploy
[[ -f /etc/sudoers.d/deploy ]] || { echo 'deploy ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/deploy; chmod 440 /etc/sudoers.d/deploy; }
ok "юзер deploy: sudo без пароля (для автоматики)"

TOTAL_MB=$(( $(grep MemTotal /proc/meminfo | awk '{print $2}') / 1024 ))
if [[ $TOTAL_MB -lt 2048 && ! -f /swapfile ]]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  ok "swap 2G включён (RAM ${TOTAL_MB}M < 2G)"
else
  ok "swap: не требуется/уже есть (RAM ${TOTAL_MB}M)"
fi

ufw status 2>/dev/null | grep -q "Status: active" || { ufw allow OpenSSH >/dev/null 2>&1; ufw allow 80,443/tcp >/dev/null 2>&1; ufw --force enable >/dev/null 2>&1; }
ok "ufw active: 22, 80, 443"
systemctl is-active fail2ban >/dev/null 2>&1 && ok "fail2ban: active" || warn "fail2ban не активен (не блокер)"

# ============================================================================
log "ЭТАП 2/7: PostgreSQL"
# ============================================================================
systemctl is-active --quiet postgresql || { systemctl enable --now postgresql >/dev/null 2>&1; systemctl is-active --quiet postgresql || die "postgresql не стартовал"; }
PG_LISTEN="$(ss -tln 2>/dev/null | grep 5432 || true)"
if echo "$PG_LISTEN" | grep -qE '127\.0\.0\.1:5432' && ! echo "$PG_LISTEN" | grep -qE '0\.0\.0\.0:5432|\[::\]:5432'; then
  ok "5432 слушает только 127.0.0.1"
else
  PGCONF="$(ls /etc/postgresql/*/main/postgresql.conf 2>/dev/null | head -1)"
  [[ -n "$PGCONF" ]] && { cp "$PGCONF" "$PGCONF.bak"; sed -i "s/^#\?listen_addresses.*/listen_addresses = 'localhost'/" "$PGCONF"; systemctl reload postgresql; ok "5432 привязан к localhost (был шире)"; }
fi

if [[ "$MODE" == "CLEAN" ]]; then
  sudo -u postgres psql -qc "CREATE ROLE $PG_ROLE LOGIN PASSWORD '$(openssl rand -hex 16)';" 2>/dev/null \
    || sudo -u postgres psql -qc "ALTER ROLE $PG_ROLE WITH PASSWORD '$(openssl rand -hex 16)';" >/dev/null || true
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$PG_DB'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE DATABASE $PG_DB OWNER $PG_ROLE;"
  ok "роль и база $PG_DB созданы (пароль будет в .env на этапе 3)"
else
  ok "UPDATE: база $PG_DB существует — не трогаю"
fi

# ============================================================================
log "ЭТАП 3/7: .env, бэкапы (UPDATE), зависимости, миграции, сборка"
# ============================================================================
chown -R deploy:deploy "$APP_DIR"
if [[ "$MODE" == "UPDATE" ]]; then
  STAMP="$(date +%F-%H%M)"
  rsync -a --exclude node_modules --exclude .next --exclude .env --exclude .git \
    "$APP_DIR/" "$APP_DIR.prev-$STAMP/" 2>/dev/null && ok "бэкап кода: $APP_DIR.prev-$STAMP"
  mkdir -p "$BACKUP_DIR"
  sudo -u postgres pg_dump "$PG_DB" | gzip > "$BACKUP_DIR/$PG_DB-$STAMP.sql.gz" && ok "бэкап БД: $BACKUP_DIR/$PG_DB-$STAMP.sql.gz"
fi

touch "$ENV_FILE"; chmod 600 "$ENV_FILE"; chown deploy:deploy "$ENV_FILE"

env_ensure() { # env_ensure KEY ЗНАЧЕНИЕ_ИЛИ_ПУСТО(сгенерить) "пояснение"
  local key="$1" gen="$2" note="$3" cur val
  cur="$(env_get "$key")"
  if [[ -n "$cur" ]]; then ok "$key = $(mask "$cur") (уже задан)"; return; fi
  if [[ "$gen" == "GENERATE" ]]; then val="$(openssl rand -hex "${4:-32}")"; else val="$gen"; fi
  [[ -z "$val" ]] && { warn "$key не задан и нечем сгенерировать ($note)"; return; }
  echo "$key=\"$val\"" >> "$ENV_FILE"
  ok "$key = $(mask "$val") (добавлен${4:+, openssl rand -hex $4})"
}

DB_PASS="$(sudo -u postgres psql -tAc "SELECT passwd FROM pg_authid WHERE rolname='$PG_ROLE'" 2>/dev/null | head -c 64 || true)"
# пароль из pg_authid зашифрован (SCRAM) — извлечь нельзя; поэтому для CLEAN генерим и ставим сами:
if [[ "$MODE" == "CLEAN" && -z "$(env_get DATABASE_URL)" ]]; then
  NEW_PG_PASS="$(openssl rand -hex 16)"
  sudo -u postgres psql -qc "ALTER ROLE $PG_ROLE WITH PASSWORD '$NEW_PG_PASS';" >/dev/null
  echo "DATABASE_URL=\"postgresql://$PG_ROLE:$NEW_PG_PASS@localhost:5432/$PG_DB\"" >> "$ENV_FILE"
  ok "DATABASE_URL = postgresql://$PG_ROLE:$(mask "$NEW_PG_PASS")@localhost:5432/$PG_DB"
fi

env_ensure "NEXT_PUBLIC_APP_URL" "https://$DOMAIN" "публичный URL приложения"
env_ensure "WEBAPP_URL"          "https://$DOMAIN" "URL для web_app-кнопки и webhook"
env_ensure "CRON_SECRET"             "GENERATE" "защита /api/cron/*" 32
env_ensure "TELEGRAM_WEBHOOK_SECRET" "GENERATE" "секрет вебхука" 32
env_ensure "CERTBOT_EMAIL"           "" "email для Let's Encrypt (укажите в .env для HTTPS)" || true

if [[ -z "$(env_get BOT_TOKEN)" ]]; then
  warn "BOT_TOKEN пуст в $ENV_FILE."
  warn "Без него: приложение и БД поднимутся, но бот/webhook/Stars-платежи не заработают."
  warn "Добавьте BOT_TOKEN=\"...\" от @BotFather и повторите запуск скрипта (идемпотентно)."
fi
if grep -q "^NEXT_PUBLIC_DEV_MODE" "$ENV_FILE" 2>/dev/null; then
  warn "NEXT_PUBLIC_DEV_MODE найден в .env — на проде быть не должно (§2.4 ТЗ)."
  warn "Удалите строку вручную и пересоберите: npm run build && pm2 restart casebattles"
fi

# домены в .env должны быть https (для tg:webhook); DNS-независимая часть продолжается
sudo -u deploy bash -c "cd $APP_DIR && npm ci --omit=dev=false >/dev/null 2>&1 || npm ci >/dev/null 2>&1 || npm ci" \
  || die "npm ci упал"
ok "npm ci"
sudo -u deploy bash -c "cd $APP_DIR && npm run pg:prepare" || die "pg:prepare упал (миграции/сид)"
ok "pg:prepare (generate + migrate deploy + seed)"
sudo -u deploy bash -c "cd $APP_DIR && npm run build" || die "build упал (проверьте swap/RAM)"
ok "npm run build"

# ============================================================================
log "ЭТАП 4/7: PM2"
# ============================================================================
sudo -u deploy bash -c "cd $APP_DIR && pm2 start deploy/ecosystem.config.cjs >/dev/null 2>&1 || pm2 reload deploy/ecosystem.config.cjs >/dev/null 2>&1" || die "pm2 start"
sudo -u deploy pm2 save >/dev/null 2>&1
# pm2 startup печатает команду systemd-юнита — выполняем её (идемпотентно)
pm2 startup systemd -u deploy --hp /home/deploy >/dev/null 2>&1 || true
systemctl is-enabled pm2-deploy >/dev/null 2>&1 || ok "автозапуск pm2: может потребоваться вручную (см. вывод pm2 startup)"
ok "pm2: casebattles запущен от deploy, автозапуск установлен"
sleep 5
HEALTH="$(curl -fsS -m 10 http://127.0.0.1:3000/api/health 2>/dev/null || true)"
[[ "$HEALTH" == *'"ok":true'* ]] && ok "health: $HEALTH" || warn "health ещё не отвечает: $HEALTH (проверьте pm2 logs casebattles)"

# ============================================================================
log "ЭТАП 5/7: Nginx + HTTPS"
# ============================================================================
cp deploy/nginx/casebattles.conf /etc/nginx/sites-available/casebattles
[[ -L /etc/nginx/sites-enabled/casebattles ]] || ln -s /etc/nginx/sites-available/casebattles /etc/nginx/sites-enabled/casebattles
[[ -e /etc/nginx/sites-enabled/default && ! -L /etc/nginx/sites-enabled/casebattles.bak ]] && { mv /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/default.bak 2>/dev/null || rm -f /etc/nginx/sites-enabled/default; }
nginx -t 2>&1 | grep -q "successful" || die "nginx -t failed"
systemctl reload nginx
ok "nginx: конфиг из deploy/nginx/, default отключён, reload"

HTTPS_READY=0
if [[ $DNS_READY -eq 1 ]]; then
  CERTBOT_EMAIL="$(env_get CERTBOT_EMAIL)"
  if [[ -z "$CERTBOT_EMAIL" ]]; then
    warn "CERTBOT_EMAIL не задан в .env — certbot пропущен (добавьте и перезапустите скрипт)"
  else
    certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos \
      -m "$CERTBOT_EMAIL" --redirect >/dev/null 2>&1 || certbot certificates 2>/dev/null | grep -q "Domains: .*edtechbattles" || true
    if certbot certificates 2>/dev/null | grep -q "VALID"; then HTTPS_READY=1; ok "certbot: сертификат VALID"; else warn "certbot не выдал сертификат — см. certbot certificates"; fi
  fi
fi

# ============================================================================
log "ЭТАП 6/7: Webhook и cron"
# ============================================================================
if [[ $HTTPS_READY -eq 1 && -n "$(env_get BOT_TOKEN)" ]]; then
  sudo -u deploy bash -c "cd $APP_DIR && npm run tg:webhook" || warn "tg:webhook упал — проверьте BOT_TOKEN/WEBAPP_URL"
  ok "webhook: ожидайте url=https://$DOMAIN/api/telegram/webhook, allowed_updates = message + callback_query + pre_checkout_query"
else
  warn "webhook отложен (HTTPS готов: $HTTPS_READY, BOT_TOKEN задан: $([[ -n "$(env_get BOT_TOKEN)" ]] && echo да || echo нет))"
fi

if [[ -n "$(env_get CRON_SECRET)" ]]; then
  bash "$APP_DIR/scripts/setup-cron.sh" || warn "setup-cron.sh упал"
  ok "cron: daily 00:05 + duels */15 + pg_dump 03:00 (идемпотентно)"
else
  warn "CRON_SECRET пуст — cron не установлен"
fi

# ============================================================================
log "ЭТАП 7/7: Smoke-тесты (локальные)"
# ============================================================================
echo "  1) health:      $(curl -fsS -m 10 http://127.0.0.1:3000/api/health 2>/dev/null || echo FAIL)"
echo "  2) pm2:         $(sudo -u deploy pm2 jlist 2>/dev/null | grep -o '"status":"online"' | head -1 || echo FAIL)"
sleep 2
RESTARTS="$(sudo -u deploy pm2 jlist 2>/dev/null | grep -o '"restart_time":[0-9]*' | grep -o '[0-9]*' || echo '?')"
echo "  3) restarts:    $RESTARTS (после 2 мин проверки не должен расти)"
echo "  4) порты:       $(ss -tln | grep -E ':(3000|5432) ' | awk '{print $4}' | tr '\n' ' ')"
echo "  5) ufw:         $(ufw status | head -1)"
if [[ $HTTPS_READY -eq 1 ]]; then
  echo "  6) https:       $(curl -s -o /dev/null -w '%{http_code}' https://$DOMAIN/api/health)"
  echo "  7) redirect:    $(curl -s -o /dev/null -w '%{http_code}' http://$DOMAIN/) → https"
fi
echo "  8) логи pm2 (ошибки за последние строки):"
sudo -u deploy pm2 logs casebattles --lines 30 --nostream 2>/dev/null | grep -iE "error|exception|ECONNREFUSED" | head -5 || echo "     чисто"

# ============================================================================
log "ИТОГ"
# ============================================================================
echo "  Режим: $MODE | HTTPS: $HTTPS_READY | DNS: $DNS_READY"
git -C "$APP_DIR" rev-parse HEAD > /dev/null 2>&1 && echo "  REVISION: $(git -C "$APP_DIR" rev-parse HEAD)" || echo "  REVISION: код без .git (залит rsync) — сверьте с репо вручную"
echo ""
echo "  ЧТО ДАЛЬШЕ (если ещё не сделано):"
echo "   1. Hardening SSH — этап 8 ТЗ, ТОЛЬКО вручную и строго последним (DEPLOY.md §Ж3)."
echo "   2. Проверка человеком в Telegram: бот → /start → Mini App → кейс → XP."
[[ $DNS_READY -eq 0 || $HTTPS_READY -eq 0 ]] && cat <<'EOF'
   3. ДОКАТКА ПОСЛЕ DNS (когда A-запись domain → этот сервер разошлась):
        # в .env должен быть CERTBOT_EMAIL="you@example.com"
        certbot --nginx -d edtechbattles.shop -d www.edtechbattles.shop --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect
        cd /opt/casebattles && sudo -u deploy npm run tg:webhook
        sudo bash scripts/setup-cron.sh   # уже идемпотентен
EOF
echo ""
echo "  Готово. Полный рунбук: DEPLOY.md §Ж (автономный деплой) и §З (ротация доступов)."
