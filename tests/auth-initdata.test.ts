import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyInitData } from "../lib/auth";

/**
 * Регрессионные векторы initData (зафиксированы 2026-10 после прод-дебага):
 * Telegram подписывает data-check-string, в которой участвует `signature`
 * и исключается ТОЛЬКО `hash`. Вектор LEGACY посчитан старым (бажным)
 * алгоритмом без signature — это ловушка против регрессии фикса.
 */
const TEST_BOT_TOKEN = "123456789:TEST_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

const INITDATA_BASE =
  "auth_date=1793272304&chat_instance=2313833633365747682&chat_type=private&query_id=AAGOTLRAAAAAAI5MtEDAscVT&" +
  "signature=Qf5KJ3vN8mZxL2pR7sT4uW9yB1cD6fG0hJ3kM5nQ8rV2xZ5bC7eF1iH4jL9oP3sU6wA0dG2kN5qT8vX4&" +
  "user=%7B%22id%22%3A1085557902%2C%22first_name%22%3A%22%D0%9C%D0%B8%D1%88%D0%B0%22%2C%22last_name%22%3A%22%22%2C%22username%22%3A%22ndekcnch%22%2C%22language_code%22%3A%22ru%22%2C%22allows_write_to_pm%22%3Atrue%2C%22photo_url%22%3A%22https%3A%2F%2Ft.me%2Fi%2Fuserpic%2F320%2FEj5RanJ_to9zYRsJL-_jmd1bl-A36P9MYlqrDoS-cWY.svg%22%7D";

// Хеш посчитан ПРАВИЛЬНЫМ алгоритмом (signature участвует, значения декодированы)
const INITDATA_VALID = `${INITDATA_BASE}&hash=446a71aead9e83298f501962354769041a32c6ebb9ceef25942c2d11d20fd45b`;

// Хеш посчитан СТАРЫМ бажным алгоритмом (signature исключён) — вектор-ловушка
const INITDATA_LEGACY = `${INITDATA_BASE}&hash=6495aaac22506905c36332665592a9b7774fbccfff4e75b1ec57dac00804f846`;

const AUTH_DATE = 1793272304;

describe("verifyInitData (регрессия прод-фикса v1.0.1)", () => {
  beforeEach(() => {
    // системное время = auth_date + 60 секунд (внутри окна 24 ч)
    vi.setSystemTime(new Date(AUTH_DATE * 1000 + 60_000));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("валидный initData: signature участвует в data-check-string", () => {
    const result = verifyInitData(INITDATA_VALID, TEST_BOT_TOKEN);
    expect(result.valid).toBe(true);
    expect(result.user?.id).toBe(1085557902);
    expect(result.user?.username).toBe("ndekcnch");
    expect(result.authDate).toBe(AUTH_DATE);
  });

  it("АНТИ-РЕГРЕССИЯ: хеш по старому алгоритму (без signature) отклоняется", () => {
    // Если кто-то вернёт исключение signature из data-check-string,
    // этот вектор станет «валидным» — и тест упадёт.
    const result = verifyInitData(INITDATA_LEGACY, TEST_BOT_TOKEN);
    expect(result.valid).toBe(false);
  });

  it("auth_date старше 24 часов отклоняется", () => {
    vi.setSystemTime(new Date(AUTH_DATE * 1000 + 25 * 3600_000));
    const result = verifyInitData(INITDATA_VALID, TEST_BOT_TOKEN);
    expect(result.valid).toBe(false);
  });

  it("initData без hash отклоняется", () => {
    const result = verifyInitData(INITDATA_VALID.split("&hash=")[0], TEST_BOT_TOKEN);
    expect(result.valid).toBe(false);
  });
});
