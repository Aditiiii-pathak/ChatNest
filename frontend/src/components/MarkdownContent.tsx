/* ── Renders assistant/user text as Markdown (bold, lists, headings, links) ─ */

"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";

type Variant = "assistant" | "user";

function buildComponents(variant: Variant): Components {
  const link =
    variant === "user"
      ? "text-emerald-100 underline decoration-emerald-200/60 underline-offset-2 hover:text-white"
      : "text-emerald-400 underline decoration-emerald-500/50 underline-offset-2 hover:text-emerald-300";
  const codeInline =
    variant === "user"
      ? "rounded bg-emerald-900/50 px-1 py-0.5 text-[0.9em] font-mono text-emerald-50"
      : "rounded bg-zinc-900 px-1 py-0.5 text-[0.9em] font-mono text-zinc-200";

  return {
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    strong: ({ children }) => (
      <strong className="font-semibold">{children}</strong>
    ),
    em: ({ children }) => <em className="italic opacity-95">{children}</em>,
    h1: ({ children }) => (
      <h1 className="mb-2 mt-3 text-lg font-bold first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">{children}</h3>
    ),
    ul: ({ children }) => (
      <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    a: ({ href, children }) => (
      <a
        href={href}
        className={link}
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    ),
    code: ({ className, children, ...props }) => {
      const isBlock = /language-/.test(className ?? "");
      if (isBlock) {
        return (
          <code
            className={`block font-mono text-[0.85em] text-zinc-100 ${className ?? ""}`}
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code className={codeInline} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre
        className={`my-2 overflow-x-auto rounded-lg p-3 ${
          variant === "user" ? "bg-emerald-900/40" : "bg-zinc-950"
        }`}
      >
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote
        className={
          variant === "user"
            ? "my-2 border-l-2 border-emerald-300/50 pl-3 text-emerald-50/95"
            : "my-2 border-l-2 border-zinc-500 pl-3 text-zinc-300"
        }
      >
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr
        className={
          variant === "user"
            ? "my-3 border-emerald-400/30"
            : "my-3 border-zinc-600"
        }
      />
    ),
  };
}

interface MarkdownContentProps {
  content: string;
  variant: Variant;
  className?: string;
}

export default function MarkdownContent({
  content,
  variant,
  className = "",
}: MarkdownContentProps) {
  return (
    <div className={`break-words ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={buildComponents(variant)}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
