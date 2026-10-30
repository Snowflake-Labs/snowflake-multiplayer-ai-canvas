"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github.css";
// Dark-mode overrides for highlight.js live in globals.css under the
// [data-theme="dark"] .hljs selector.

export function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-canvas text-[14.5px] text-[color:var(--color-text-primary)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
