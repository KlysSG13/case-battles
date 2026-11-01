#!/usr/bin/env bash
# Идемпотентная установка cron-задач «Кейс-баттлов» (запускать от root на сервере).
#   daily   — напоминания о серии + пересчёт дрона (00:05 МСК)
#   duels   — экспирация дуэлей старше 48 ч (каждые 15 минут)
#   backup  — ежедневный pg_dump в 03:00 с ретеншном 7 дней (v1.2.3)
# Секрет вписывается в crontab литерально: cron не разворачивает переменные окружения.
# --dry-run: напечатать план без записи в crontab.
set -euo pipefail

ENV_FILE="/opt/casebattles/.env"
LOG_FILE="/var/log/casebattles-cron.log"
BACKUP_DIR="/root/backups"
BASE_URL="${BASE_URL:-https://edtechbattles.shop}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

if [[ $EUID -ne 0 ]]; then
  echo "✗ Запустите от root (sudo bash scripts/setup-cron.sh [--dry-run])" >&2
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
# проценты в crontab обязаны быть экранированы (\%), $(...) cron тоже не разворачивает —
# потому date вызывается через shell: gzip пишет уже с датой в имени
BACKUP_LINE="0 3 * * *  sudo -u postgres pg_dump casegames | gzip > ${BACKUP_DIR}/casegames-\$(date +\\%F).sql.gz && find ${BACKUP_DIR} -name 'casegames-*.sql.gz' -mtime +7 -delete"

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
add_or_replace "pg_dump casegames" "$BACKUP_LINE"

# чистим пустые строки и записываем crontab
if [[ $DRY_RUN -eq 1 ]]; then
  echo "── dry-run: crontab НЕ изменён. Будут установлены строки:"
  echo "$NEW" | sed -e '/^[[:space:]]*$/d' | grep -E "casebattles|cron/(daily|duels)|pg_dump" || true
  echo ""
  echo "── Также будет выполнено: mkdir -p ${BACKUP_DIR}"
  exit 0
fi

mkdir -p "$BACKUP_DIR"

echo "$NEW" | sed -e '/^[[:space:]]*$/d' | crontab -

echo "✅ Cron установлен (crontab root):"
crontab -l | grep -E "casebattles|cron/(daily|duels)|pg_dump" || true
echo ""
echo "Ручная проверка:"
echo "  curl -fsS -X POST -H \"Authorization: Bearer \$CRON_SECRET\" ${BASE_URL}/api/cron/daily"
echo "  curl -fsS -X POST -H \"Authorization: Bearer \$CRON_SECRET\" ${BASE_URL}/api/cron/duels"
echo "Бэкап (запуск строки вручную — см. DEPLOY.md «Обслуживание»):"
echo "  ls -lh ${BACKUP_DIR}/"
echo "Лог: tail -f $LOG_FILE"
