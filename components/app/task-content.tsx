"use client";

import { useMemo } from "react";
import { parseTaskBody, type TaskBlock } from "@/lib/task-blocks";
import { cn } from "@/lib/utils";

interface TaskContentProps {
  body: string; // JSON-блоки или legacy-текст (фолбэк-разбор)
  title?: string;
  className?: string;
}

/**
 * Структурированная подача задания: заголовок -> контекст -> пункты ->
 * данные таблицей -> вопрос. Анимации живут на рамке/заголовке, не на тексте
 * условия (typewriter/сканлиния/глитч/градиентная кромка, CSS-only).
 */
export function TaskContent({ body, title, className }: TaskContentProps) {
  const doc = useMemo(() => parseTaskBody(body), [body]);
  const titleLen = Math.min((title ?? "").length, 40);

  return (
    <div className={cn("task-frame animate-rise", className)}>
      <div className="task-panel">
        {title && (
          <h2
            className="task-title font-display text-base font-bold leading-snug text-fog"
            style={{ "--n": titleLen, "--w": `${titleLen}ch` } as React.CSSProperties}
          >
            {title}
          </h2>
        )}
        <div className="mt-3 space-y-3">
          {doc.blocks.map((block, i) => (
            <TaskBlockView key={i} block={block} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskBlockView({ block }: { block: TaskBlock }) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="text-[14px] leading-relaxed text-fog/90">{block.text}</p>
      );
    case "list": {
      const tone = block.tone ?? "neutral";
      return (
        <ul className="space-y-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-fog/90">
              <span
                className={cn(
                  "mt-0.5 shrink-0 font-display text-[11px] font-bold",
                  tone === "danger" && "text-magenta",
                  tone === "accent" && "text-neon",
                  tone === "neutral" && "text-dim"
                )}
              >
                {block.ordered ? `${i + 1}.` : "▸"}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    }
    case "table":
      return <TaskTable block={block} />;
    case "code":
      return (
        <pre className="overflow-x-auto rounded-lg border border-line bg-ink/70 p-3 font-display text-[12px] leading-relaxed text-neon/90">
          {block.text}
        </pre>
      );
    case "question":
      return (
        <div className="rounded-lg border border-neon/40 bg-neon/8 px-4 py-3">
          <p className="font-display text-[10px] tracking-[0.25em] text-neon">ВОПРОС</p>
          <p className="mt-1 text-[14px] font-semibold leading-relaxed text-fog">
            {block.text}
          </p>
        </div>
      );
  }
}

function TaskTable({ block }: { block: Extract<TaskBlock, { type: "table" }> }) {
  return (
    <div className="overflow-hidden rounded-lg border border-neon/25">
      {block.caption && (
        <p className="border-b border-neon/25 bg-neon/8 px-3 py-1.5 font-display text-[10px] tracking-[0.2em] text-neon">
          {block.caption.toUpperCase()}
        </p>
      )}
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-panel-2">
            {block.headers.map((h, i) => (
              <th
                key={i}
                className="border-b border-line px-3 py-2 text-left font-display text-[10px] font-bold tracking-wider text-dim"
              >
                {h.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 1 ? "bg-white/[0.02]" : undefined}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={cn(
                    "border-b border-line/60 px-3 py-2 text-[13px] leading-snug",
                    ci === 0 ? "font-display text-fog" : "font-display text-fog/85",
                    /^[-+]?[\d\s.,%₽]+$/.test(cell) && "text-right tabular-nums text-neon/90"
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
