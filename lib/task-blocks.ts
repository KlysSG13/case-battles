// Структурированная подача задания: JSON-блоки вместо «стены текста».
// Поддерживается рендер-фолбэк: любой legacy-текст из БД разбирается на блоки.

export type TaskBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean; tone?: "neutral" | "danger" | "accent" }
  | { type: "table"; caption?: string; headers: string[]; rows: string[][] }
  | { type: "code"; text: string }
  | { type: "question"; text: string };

export interface TaskDoc {
  blocks: TaskBlock[];
}

export function isTaskDoc(value: unknown): value is TaskDoc {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as TaskDoc).blocks)
  );
}

const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;

/**
 * Разбор тела кейса на блоки.
 *  - новое содержание: body = JSON {"blocks":[...]} (валидируем по форме);
 *  - legacy-текст: абзацы -> paragraph, строки-пункты -> list,
 *    финальный вопрос («?») -> question.
 */
export function parseTaskBody(body: string): TaskDoc {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isTaskDoc(parsed) && parsed.blocks.length > 0) {
        return { blocks: parsed.blocks.filter(isRenderableBlock) };
      }
    } catch {
      /* это не JSON — идём в фолбэк */
    }
  }
  return { blocks: splitLegacyIntoBlocks(trimmed) };
}

function isRenderableBlock(block: unknown): boolean {
  if (typeof block !== "object" || block === null) return false;
  const b = block as { type?: unknown; text?: unknown; items?: unknown; headers?: unknown; rows?: unknown };
  switch (b.type) {
    case "paragraph":
    case "code":
    case "question":
      return typeof b.text === "string" && b.text.trim().length > 0;
    case "list":
      return Array.isArray(b.items) && b.items.length > 0;
    case "table":
      return (
        Array.isArray(b.headers) &&
        b.headers.length > 0 &&
        Array.isArray(b.rows) &&
        b.rows.length > 0
      );
    default:
      return false;
  }
}

function splitLegacyIntoBlocks(text: string): TaskBlock[] {
  const blocks: TaskBlock[] = [];
  let buffer: string[] = [];
  let currentList: { items: string[]; ordered: boolean } | null = null;

  const flushParagraph = () => {
    if (buffer.length > 0) {
      blocks.push({ type: "paragraph", text: buffer.join(" ") });
      buffer = [];
    }
  };
  const flushList = () => {
    if (currentList) {
      blocks.push({ type: "list", items: currentList.items, ordered: currentList.ordered });
      currentList = null;
    }
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const marker = line.match(LIST_MARKER);
    if (marker) {
      flushParagraph();
      const ordered = /\d/.test(marker[0]);
      const item = line.replace(LIST_MARKER, "");
      if (!currentList || currentList.ordered !== ordered) {
        flushList();
        currentList = { items: [], ordered };
      }
      currentList.items.push(item);
    } else {
      flushList();
      buffer.push(line);
    }
  }
  flushParagraph();
  flushList();

  // финальный абзац-вопрос -> question
  const last = blocks[blocks.length - 1];
  if (last?.type === "paragraph" && last.text.trim().endsWith("?")) {
    blocks[blocks.length - 1] = { type: "question", text: last.text };
  }
  return blocks;
}

/** Плоский текст из блоков — для AI-оценщика (caseBody). */
export function blocksToPlainText(blocks: TaskBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "paragraph":
        case "code":
        case "question":
          return b.text;
        case "list":
          return b.items.map((it, i) => `${i + 1}. ${it}`).join("\n");
        case "table": {
          const head = b.headers.join(" | ");
          const rows = b.rows.map((r) => r.join(" | ")).join("\n");
          return `${b.caption ? b.caption + ":\n" : ""}${head}\n${rows}`;
        }
      }
    })
    .join("\n\n");
}

/** Первый параграф как «контекст», вопрос — как вопрос (для компактных мест). */
export function docQuestion(doc: TaskDoc): string | null {
  const q = doc.blocks.find((b) => b.type === "question");
  return q && q.type === "question" ? q.text : null;
}
