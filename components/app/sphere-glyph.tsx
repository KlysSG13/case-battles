"use client";

// SVG-глифы сфер: уникальный знак каждой сферы, наследует акцентный цвет.

interface SphereGlyphProps {
  slug: string;
  color: string;
  className?: string;
}

export function SphereGlyph({ slug, color, className }: SphereGlyphProps) {
  switch (slug) {
    case "business":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path d="M3 20h18" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M6 20v-6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M11 20V8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M16 20v-9" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M21 20V4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="21" cy="4" r="1.6" fill={color} />
        </svg>
      );
    case "product":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path
            d="M12 2.5 20 7v10l-8 4.5L4 17V7l8-4.5Z"
            stroke={color}
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.6" />
          <path d="M12 2.5v6.5M12 15v6.5M4 7l5.4 3.4M14.6 13.6 20 17" stroke={color} strokeWidth="1.1" opacity="0.7" />
        </svg>
      );
    case "law":
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <path d="M12 3v18M8 21h8" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 7h16" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 7l-2.5 6h5L4 7ZM20 7l-2.5 6h5L20 7Z" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="12" cy="4.5" r="1.4" fill={color} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.6" />
        </svg>
      );
  }
}
