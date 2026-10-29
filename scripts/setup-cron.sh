#!/usr/bin/env bash
# Идемпотентная установка cron-задач «Кейс-баттлов» (запускать от root на сервере).
#   daily — напоминания о серии + пересчёт дрона (00:05 МСК)
#   duels — экспирация дуэлей старше 48 ч (каждые 15 минут)
# Секрет вписывается в crontab литерально: cron не разворачивает переменные окружения.
set -euo pipefail

ENV_FILE="/opt/casebattles/.env"
LOG_FILE="/var/log/casebattles-cron.log"
BASE_URL="${BASE_URL:-https://edtechbattles.shop}"

if [[ $EUID -ne 0 ]]; then
  echo "✗ Запустите от root (sudo bash scripts/setup-cron.sh)" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "✗ Не найден $ENV_FILE" >&2
  exit 1
fi

CRON_SECRET="$(grep -E '^CRON_SECRET=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '[:space:]')"
if [[ -z "$CRON_SECRET" ]]; then
  cat >&2 <<EOF
✗ CRON_SECRET пуст или отсутствует в $ENV_FILE.
  Сгенерируйте: openssl rand -hex 32
  Впишите в .env: CRON_SECRET=<значение>
  И повторите: sudo bash scripts/setup-cron.sh
EOF
  exit 1
fi

touch "$LOG_FILE"
chmod 640 "$LOG_FILE"

DAILY_LINE="5 0 * * *  curl -fsS -X POST -H \"Authorization: Bearer ${CRON_SECRET}\" ${BASE_URL}/api/cron/daily >> ${LOG_FILE} 2>&1"
DUELS_LINE="*/15 * * * *  curl -fsS -X POST -H \"Authorization: Bearer ${CRON_SECRET}\" ${BASE_URL}/api/cron/duels >> ${LOG_FILE} 2>&1"

CURRENT="$(crontab -l 2>/dev/null || true)"
NEW="$CURRENT"

add_or_replace() {
  local marker="$1" line="$2"
  if echo "$NEW" | grep -Fq "$marker"; then
    # заменяем существующие строки (старый секрет/URL), а не дублируем
    NEW="$(echo "$NEW" | grep -Fv "$marker" || true)"$'\n'"$line"
  else
    NEW="${NEW%"$'\n'"}"$'\n'"$line"
  fi
}

add_or_replace "/api/cron/daily" "$DAILY_LINE"
add_or_replace "/api/cron/duels" "$DUELS_LINE"

# чистим пустые строки и записываем crontab
echo "$NEW" | sed -e '/^[[:space:]]*$/d' | crontab -

echo "✅ Cron установлен (crontab root):"
crontab -l | grep -E "casebattles|cron/(daily|duels)" || true
echo ""
echo "Ручная проверка:"
echo "  curl -fsS -X POST -H \"Authorization: Bearer \$CRON_SECRET\" ${BASE_URL}/api/cron/daily"
echo "  curl -fsS -X POST -H \"Authorization: Bearer \$CRON_SECRET\" ${BASE_URL}/api/cron/duels"
echo "Лог: tail -f $LOG_FILE"
