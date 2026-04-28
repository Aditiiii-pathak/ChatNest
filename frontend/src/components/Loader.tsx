/* ── Loading spinner ───────────────────────────────────────────────────────── */

"use client";

interface LoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "h-4 w-4 border-2",
  md: "h-6 w-6 border-2",
  lg: "h-10 w-10 border-3",
};

export default function Loader({ size = "md", className = "" }: LoaderProps) {
  return (
    <div
      className={`animate-spin rounded-full border-zinc-600 border-t-emerald-400 ${sizes[size]} ${className}`}
    />
  );
}
