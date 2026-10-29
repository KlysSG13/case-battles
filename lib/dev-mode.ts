/**
 * Dev-режим для локального предпросмотра Mini App вне Telegram.
 *
 * NODE_ENV подставляется бандлером НА ЭТАПЕ СБОРКИ, поэтому в production-билде
 * константа всегда false — даже если NEXT_PUBLIC_DEV_MODE задан в окружении
 * при запуске. Без валидного Telegram initData прод-сборка всегда отвечает
 * экраном «Открой приложение через Telegram».
 */
export const DEV_MODE: boolean =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEV_MODE === "1";
