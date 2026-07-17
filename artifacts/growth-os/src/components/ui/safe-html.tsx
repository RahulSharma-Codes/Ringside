import React from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

const ALLOWED_TAGS = [
  "p", "strong", "em", "u", "s", "ul", "ol", "li",
  "a", "br", "h1", "h2", "h3", "blockquote", "code", "pre",
];
const ALLOWED_ATTR = ["href", "target", "rel"];

interface SafeHtmlProps {
  html: string;
  className?: string;
}

export function SafeHtml({ html, className }: SafeHtmlProps) {
  if (!html) return null;
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(html);
  const content = hasHtmlTags ? html : `<p>${html.replace(/\n/g, "<br>")}</p>`;
  const clean = DOMPurify.sanitize(content, { ALLOWED_TAGS, ALLOWED_ATTR });
  return (
    <div
      className={cn("prose prose-sm dark:prose-invert max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

export function stripHtmlTags(html: string): string {
  if (!html) return "";
  const hasHtmlTags = /<[a-z][\s\S]*>/i.test(html);
  if (!hasHtmlTags) return html;
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  const div = document.createElement("div");
  div.innerHTML = clean;
  return div.textContent ?? div.innerText ?? "";
}
