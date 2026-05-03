import React, { useState, useRef, useEffect } from "react";
import { Bot, Send, AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { customFetch } from "@workspace/api-client-react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AiAskResponse {
  answer: string | null;
  model?: string;
  setupRequired?: boolean;
  error?: string;
}

const SUGGESTED_PROMPTS = [
  "Which Must-Win opportunities need attention?",
  "Which deals have overdue actions?",
  "Summarise the active pipeline.",
  "Which opportunities have had no interaction in 30 days?",
  "What changed recently?",
  "Which deals are stuck by stage?",
  "What should I review before the weekly pipeline meeting?",
];

async function askAi(question: string, history: Message[]): Promise<AiAskResponse> {
  return customFetch<AiAskResponse>("/api/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
}

export default function Copilot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSubmit = async (question: string) => {
    if (!question.trim() || isLoading) return;
    setError(null);
    const userMsg: Message = { role: "user", content: question.trim() };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const res = await askAi(userMsg.content, messages);
      if (res.setupRequired) {
        setSetupRequired(true);
        return;
      }
      if (res.answer) {
        setMessages([...nextMessages, { role: "assistant", content: res.answer }]);
      }
    } catch (_err) {
      setError("Could not reach the AI service. Please try again.");
      setMessages(nextMessages.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(input);
    }
  };

  if (setupRequired) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-border/60 p-4 flex items-center gap-2.5 bg-background/80 backdrop-blur-sm">
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Bot size={14} className="text-primary" />
          </div>
          <h1 className="font-mono uppercase text-sm tracking-tight font-bold">AI Copilot</h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-muted border border-border/60">
              <AlertTriangle size={22} className="text-muted-foreground" />
            </div>
            <h2 className="font-semibold text-lg">AI Copilot Not Configured</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The AI service is not available. An{" "}
              <code className="text-xs bg-muted border border-border/60 px-1.5 py-0.5 rounded-md font-mono">OPENAI_API_KEY</code>{" "}
              secret must be set to enable this feature. Contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-screen">
      {/* Header */}
      <div className="border-b border-border/60 p-4 flex items-center gap-2.5 shrink-0 bg-background/80 backdrop-blur-sm">
        <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Bot size={14} className="text-primary" />
        </div>
        <h1 className="font-mono uppercase text-sm tracking-tight font-bold">AI Copilot</h1>
        <span className="text-[10px] text-muted-foreground/70 font-mono ml-2 bg-muted/60 border border-border/50 px-2 py-0.5 rounded-md">
          Read-Only
        </span>
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && !isLoading && (
          <div className="space-y-6 pt-6">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20">
                <Sparkles size={24} className="text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-base">Ask about your pipeline</h2>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-1 leading-relaxed">
                  I can answer questions using live data from your M&amp;A pipeline.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSubmit(prompt)}
                  className="text-left text-sm px-3.5 py-2.5 rounded-xl border border-border/60 bg-card hover:bg-muted/30 transition-all duration-150 text-muted-foreground hover:text-foreground hover:border-border"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center mt-0.5">
                <Bot size={14} className="text-primary" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-card border border-border/60 text-foreground rounded-bl-sm"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center">
              <Bot size={14} className="text-primary" />
            </div>
            <div className="bg-card border border-border/60 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Analysing pipeline data…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
            <AlertTriangle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border/60 p-4 shrink-0 bg-background/80 backdrop-blur-sm mobile-safe-bottom">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your pipeline… (Enter to send)"
            className="resize-none rounded-xl min-h-[44px] max-h-32 text-sm border-border/70 bg-card focus-visible:ring-primary/30"
            rows={1}
            disabled={isLoading}
          />
          <Button
            size="sm"
            onClick={() => handleSubmit(input)}
            disabled={!input.trim() || isLoading}
            className="rounded-xl shrink-0 h-[44px] w-[44px] p-0"
          >
            <Send size={15} />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/60 font-mono mt-2 leading-relaxed">
          AI answers are generated from live pipeline data. Review before acting.
        </p>
      </div>
    </div>
  );
}
