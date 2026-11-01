// PM2-конфигурация «Кейс-баттлов» (версионируется; сервер стартует через
// `pm2 start deploy/ecosystem.config.cjs` от пользователя deploy).
// Приложение читает секреты из /opt/casebattles/.env (Next.js подхватывает сам).
module.exports = {
  apps: [
    {
      name: "casebattles",
      cwd: "/opt/casebattles",
      script: "npm",
      args: "start",
      exec_mode: "fork",
      max_memory_restart: "600M",
      env: { NODE_ENV: "production" },
      // не тащим NEXT_PUBLIC_DEV_MODE на прод — dev-вход собирается выключенным
      time: true,
    },
  ],
};
