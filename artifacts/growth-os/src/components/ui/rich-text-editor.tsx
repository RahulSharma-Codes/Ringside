import React, { useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Bold, Italic, List, ListOrdered, Link2, Link2Off } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  maxLength = 5000,
  className,
  minHeight = "80px",
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.isEmpty ? "" : editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "focus:outline-none px-3 py-2 text-sm leading-relaxed",
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? "" : editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);

  const charCount = editor ? editor.getText().length : 0;
  const isOverLimit = charCount > maxLength;
  const isNearLimit = charCount > maxLength * 0.8;

  const setLink = useCallback(() => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Enter URL", prev ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={cn(
        "rounded-sm border border-input bg-background/50 overflow-hidden",
        isOverLimit && "border-destructive",
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-border/60 bg-muted/20 flex-wrap shrink-0">
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Bold"
        >
          <Bold size={12} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="Italic"
        >
          <Italic size={12} />
        </ToolbarBtn>
        <div className="w-px h-3.5 bg-border/60 mx-0.5 shrink-0" />
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Bullet list"
        >
          <List size={12} />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numbered list"
        >
          <ListOrdered size={12} />
        </ToolbarBtn>
        <div className="w-px h-3.5 bg-border/60 mx-0.5 shrink-0" />
        <ToolbarBtn onClick={setLink} active={editor.isActive("link")} title="Insert / edit link">
          <Link2 size={12} />
        </ToolbarBtn>
        {editor.isActive("link") && (
          <ToolbarBtn
            onClick={() => editor.chain().focus().unsetLink().run()}
            active={false}
            title="Remove link"
          >
            <Link2Off size={12} />
          </ToolbarBtn>
        )}
      </div>

      {/* Editor content */}
      <div style={{ minHeight }} className="rte-content">
        <EditorContent editor={editor} />
      </div>

      {/* Character count */}
      {(isNearLimit || isOverLimit) && (
        <div
          className={cn(
            "px-3 py-0.5 text-[10px] font-mono text-right border-t border-border/40",
            isOverLimit ? "text-destructive" : "text-amber-500",
          )}
        >
          {charCount} / {maxLength}
        </div>
      )}
    </div>
  );
}

function ToolbarBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick: () => void;
  active: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={cn(
        "h-6 w-6 flex items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}
