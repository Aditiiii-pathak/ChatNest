/* ── ChatNest brand mark (public/logo.png) ─────────────────────────────────── */

"use client";

import Image from "next/image";

const SIZES = {
  sm: { className: "h-8 w-8", pixels: 32 },
  md: { className: "h-14 w-14", pixels: 56 },
  lg: { className: "h-16 w-16", pixels: 64 },
  /** Welcome / hero empty state */
  xl: { className: "h-20 w-20", pixels: 80 },
} as const;

export type BrandLogoSize = keyof typeof SIZES;

interface BrandLogoProps {
  size?: BrandLogoSize;
  className?: string;
}

export default function BrandLogo({ size = "md", className = "" }: BrandLogoProps) {
  const { className: dim, pixels } = SIZES[size];
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-600/25 shadow-sm ${dim} ${className}`.trim()}
    >
      <Image
        src="/logo.png"
        alt="ChatNest"
        width={pixels}
        height={pixels}
        className="h-full w-full object-contain"
        priority
        sizes={`${pixels}px`}
      />
    </div>
  );
}
