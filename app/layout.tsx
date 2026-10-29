import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Кейс-игры",
  description:
    "Тренажёр решений: кейсы по бизнесу, продукту и праву с оценкой ИИ, XP и сериями",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0e17",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: telegram-web-app.js проставляет --tg-* переменные на <html> до гидратации
    <html lang="ru" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Синхронная загрузка (без next/script): window.Telegram.WebApp готов
            ДО гидратации и первого apiFetch — initData не может быть пустой.
            next/script beforeInteractive в App Router рендерит async-тег и создаёт гонку. */}
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
      </head>
      <body className="min-h-full flex flex-col">
        <div className="pointer-events-none fixed inset-0 z-0 grid-overlay" />
        <div className="pointer-events-none fixed inset-0 z-0 scanlines" />
        <div className="relative z-10 flex min-h-dvh flex-col">{children}</div>
      </body>
    </html>
  );
}
