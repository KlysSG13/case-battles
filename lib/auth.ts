import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { DEV_MODE } from "./dev-mode";
import type { User } from "@prisma/client";

const AUTH_MAX_AGE_SEC = 24 * 60 * 60; // auth_date не старше 24 часов

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; status: number; code: string; message: string };

interface TmaUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/**
 * Проверка initData из Telegram WebApp:
 * data_check_string = пары key=value (исключается ТОЛЬКО hash), сортировка, соединение \n;
 * secret_key = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN);
 * hash = HMAC_SHA256(key=secret_key, data=data_check_string), hex, constant-time сравнение.
 *
 * ВАЖНО: поле signature УЧАСТВУЕТ в data-check-string. Подтверждено перебором на проде:
 * Telegram подписывает initData вместе с signature, исключение signature ломает проверку
 * на всех современных клиентах (эксперимент от 2026-10, см. DEPLOY.md, раздел Troubleshooting).
 */
export function verifyInitData(
  initData: string,
  botToken: string
): { valid: boolean; user?: TmaUser; authDate?: number } {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { valid: false };

  const pairs: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const computed = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(hash, "utf8");
  const constantTimeEqual =
    a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!constantTimeEqual) return { valid: false };

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > AUTH_MAX_AGE_SEC) {
    return { valid: false };
  }

  let user: TmaUser | undefined;
  try {
    const raw = params.get("user");
    if (raw) user = JSON.parse(raw) as TmaUser;
  } catch {
    user = undefined;
  }
  if (!user?.id) return { valid: false };
  return { valid: true, user, authDate };
}

const DEV_PREFIX = "dev:";

/**
 * Аутентификация запросов /api/app/*.
 * Authorization: tma <initData>.
 * В dev-режиме (только не-прод сборка + NEXT_PUBLIC_DEV_MODE=1) допускается
 * служебная строка "dev:<telegramId>" для локального предпросмотра вне Telegram.
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthResult> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("tma ")) {
    return { ok: false, status: 401, code: "unauthorized", message: "Открой приложение через Telegram" };
  }
  const initData = header.slice("tma ".length).trim();

  if (initData.startsWith(DEV_PREFIX)) {
    if (!DEV_MODE) {
      return { ok: false, status: 401, code: "unauthorized", message: "Открой приложение через Telegram" };
    }
    const telegramId = Number(initData.slice(DEV_PREFIX.length).replace(/\D/g, "")) || 0;
    if (!telegramId) {
      return { ok: false, status: 401, code: "unauthorized", message: "Открой приложение через Telegram" };
    }
    const user = await upsertUser({ id: telegramId, first_name: "Гость", username: "dev_preview" });
    return { ok: true, user };
  }

  const botToken = process.env.BOT_TOKEN ?? "";
  if (!botToken) {
    return { ok: false, status: 401, code: "unauthorized", message: "Открой приложение через Telegram" };
  }
  const check = verifyInitData(initData, botToken);
  if (!check.valid || !check.user) {
    return { ok: false, status: 401, code: "unauthorized", message: "Открой приложение через Telegram" };
  }
  const user = await upsertUser(check.user);
  return { ok: true, user };
}

async function upsertUser(tma: TmaUser): Promise<User> {
  const firstName = (tma.first_name || "").trim() || "Игрок";
  return prisma.user.upsert({
    where: { telegramId: tma.id },
    create: {
      telegramId: tma.id,
      username: tma.username ?? null,
      firstName,
    },
    update: {
      username: tma.username ?? null,
      firstName,
    },
  });
}
