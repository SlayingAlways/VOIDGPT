"use client";

import React, { useState } from "react";

interface MarkdownViewProps {
  content: string;
}

export function MarkdownView({ content }: MarkdownViewProps) {
  // Simple, safe client-side Markdown parser tailored for chat responses
  const renderFormatted = (text: string) => {
    // Split into code blocks vs prose
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let keyIndex = 0;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Push preceding text
      if (match.index > lastIndex) {
        const textChunk = text.slice(lastIndex, match.index);
        parts.push(
          <div key={`chunk-${keyIndex++}`} className="markdown-prose">
            {renderProse(textChunk)}
          </div>
        );
      }

      const lang = match[1] || "text";
      const code = match[2];

      parts.push(
        <CodeBlock key={`code-${keyIndex++}`} language={lang} code={code} />
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(
        <div key={`chunk-${keyIndex++}`} className="markdown-prose">
          {renderProse(text.slice(lastIndex))}
        </div>
      );
    }

    return parts;
  };

  const renderProse = (prose: string) => {
    const lines = prose.split("\n");
    const elements: React.ReactNode[] = [];
    let inList = false;
    let listItems: React.ReactNode[] = [];

    const flushList = () => {
      if (inList && listItems.length > 0) {
        elements.push(
          <ul key={`ul-${elements.length}`} className="markdown-list">
            {listItems}
          </ul>
        );
        listItems = [];
        inList = false;
      }
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      // Heading 1
      if (line.startsWith("# ")) {
        flushList();
        elements.push(
          <h1 key={`h1-${idx}`} className="markdown-h1">
            {renderInline(line.slice(2))}
          </h1>
        );
        return;
      }

      // Heading 2
      if (line.startsWith("## ")) {
        flushList();
        elements.push(
          <h2 key={`h2-${idx}`} className="markdown-h2">
            {renderInline(line.slice(3))}
          </h2>
        );
        return;
      }

      // Heading 3
      if (line.startsWith("### ")) {
        flushList();
        elements.push(
          <h3 key={`h3-${idx}`} className="markdown-h3">
            {renderInline(line.slice(4))}
          </h3>
        );
        return;
      }

      // Blockquote
      if (line.startsWith("> ")) {
        flushList();
        elements.push(
          <blockquote key={`bq-${idx}`} className="markdown-quote">
            {renderInline(line.slice(2))}
          </blockquote>
        );
        return;
      }

      // Unordered list
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        inList = true;
        listItems.push(
          <li key={`li-${idx}`}>{renderInline(trimmed.slice(2))}</li>
        );
        return;
      }

      // Ordered list
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        inList = true;
        listItems.push(
          <li key={`li-${idx}`}>{renderInline(numMatch[2])}</li>
        );
        return;
      }

      flushList();

      if (trimmed === "") {
        elements.push(<div key={`br-${idx}`} className="markdown-space" />);
      } else {
        elements.push(
          <p key={`p-${idx}`} className="markdown-p">
            {renderInline(line)}
          </p>
        );
      }
    });

    flushList();
    return elements;
  };

  const renderInline = (text: string): React.ReactNode => {
    // Process inline code, bold, italic, links
    // First split by inline code `...`
    const codeParts = text.split(/(`[^`]+`)/);
    return codeParts.map((part, pIdx) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        return (
          <code key={`inline-code-${pIdx}`} className="inline-code">
            {part.slice(1, -1)}
          </code>
        );
      }

      // Format bold **...** and *...*
      const boldParts = part.split(/(\*\*[^*]+\*\*)/);
      return boldParts.map((bPart, bIdx) => {
        if (bPart.startsWith("**") && bPart.endsWith("**") && bPart.length > 4) {
          return (
            <strong key={`b-${pIdx}-${bIdx}`}>
              {bPart.slice(2, -2)}
            </strong>
          );
        }

        // Format italic *...*
        const italicParts = bPart.split(/(\*[^*]+\*)/);
        return italicParts.map((iPart, iIdx) => {
          if (iPart.startsWith("*") && iPart.endsWith("*") && iPart.length > 2) {
            return <em key={`i-${pIdx}-${bIdx}-${iIdx}`}>{iPart.slice(1, -1)}</em>;
          }
          return iPart;
        });
      });
    });
  };

  return <div className="markdown-body">{renderFormatted(content)}</div>;
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{language || "code"}</span>
        <div className="code-head-actions">
          <button
            type="button"
            className="code-action"
            onClick={copyToClipboard}
            aria-label="Copy code"
          >
            {copied ? (
              <>
                <svg className="icon tiny" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4.5 12.5l5 5 10-11" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <svg className="icon tiny" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <rect x="8.5" y="8.5" width="11" height="11" rx="2"/>
                  <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>
                </svg>
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>
      <pre>
        <code>{code.replace(/\n$/, "")}</code>
      </pre>
    </div>
  );
}
