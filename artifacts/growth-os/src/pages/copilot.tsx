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
  "Summarize the active pipeline.",
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
        <div className="border-b border-border p-4 flex items-center gap-2">
          <Bot size={18} className="text-primary" />
          <h1 className="font-mono uppercase text-sm tracking-tight font-bold">AI Copilot</h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted">
              <AlertTriangle size={24} className="text-muted-foreground" />
            </div>
            <h2 className="font-semibold text-lg">AI Copilot Not Configured</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The AI service is not available. An <code className="text-xs bg-muted px-1 py-0.5 rounded">OPENAI_API_KEY</code> secret
              must be set in the Replit environment to enable this feature. Contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-screen">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-center gap-2 shrink-0">
        <Bot size={18} className="text-primary" />
        <h1 className="font-mono uppercase text-sm tracking-tight font-bold">AI Copilot</h1>
        <span className="text-[10px] text-muted-foreground font-mono ml-2 bg-muted px-2 py-0.5 rounded">Read-Only</span>
      </div>

      {/* Message area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && !isLoading && (
          <div className="space-y-6 pt-4">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                <Sparkles size={22} className="text-primary" />
              </div>
              <h2 className="font-semibold">Ask about your pipeline</h2>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                I can answer questions using live data from your M&A pipeline. Try one of the suggestions below.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSubmit(prompt)}
                  className="text-left text-sm px-3 py-2.5 rounded-sm border border-border bg-card hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
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
              <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                <Bot size={14} className="text-primary" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-sm px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-3 justify-start">
            <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Bot size={14} className="text-primary" />
            </div>
            <div className="bg-muted rounded-sm px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Analysing pipeline data…</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-sm px-3 py-2">
            <AlertTriangle size={14} />
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4 shrink-0 space-y-2">
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your pipeline… (Enter to send, Shift+Enter for newline)"
            className="resize-none rounded-sm min-h-[44px] max-h-32 text-sm"
            rows={1}
            disabled={isLoading}
          />
          <Button
            size="sm"
            onClick={() => handleSubmit(input)}
            disabled={!input.trim() || isLoading}
            className="rounded-sm shrink-0"
          >
            <Send size={14} />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
          AI answers are generated from available pipeline data and should be reviewed before decisions.
        </p>
      </div>
    </div>
  );
}
