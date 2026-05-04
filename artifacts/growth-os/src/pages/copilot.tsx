import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Bot, Send, AlertTriangle, Loader2, Sparkles, CheckCircle2,
  CreditCard, FileText, CalendarCheck, Zap,
} from "lucide-react";
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

interface AiStatusResponse {
  available: boolean;
  setupRequired: boolean;
  billingRequired: boolean;
  model?: string;
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

const AI_WORKFLOW_CARDS = [
  {
    id: "pipeline",
    icon: <Sparkles size={16} className="text-primary" />,
    title: "Ask about pipeline",
    description: "Analyse pipeline status, stage distribution, and key metrics.",
    action: "ask",
  },
  {
    id: "meeting-notes",
    icon: <FileText size={16} className="text-amber-500" />,
    title: "Parse meeting notes",
    description: "Turn raw call notes into structured interactions and action items.",
    action: "meeting-notes",
  },
  {
    id: "opportunity-brief",
    icon: <Zap size={16} className="text-emerald-500" />,
    title: "Generate opportunity brief",
    description: "Create a leadership-ready summary for any deal in the pipeline.",
    action: "opportunity-brief",
  },
  {
    id: "weekly-brief",
    icon: <CalendarCheck size={16} className="text-blue-500" />,
    title: "Generate weekly review brief",
    description: "Produce an executive brief covering the week's pipeline movements.",
    action: "weekly-brief",
  },
];

async function askAi(question: string, history: Message[]): Promise<AiAskResponse> {
  return customFetch<AiAskResponse>("/api/ai/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history }),
  });
}

export default function Copilot() {
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [billingRequired, setBillingRequired] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatusResponse | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch AI status once on mount
  useEffect(() => {
    customFetch<AiStatusResponse>("/api/ai/status")
      .then((s) => {
        setAiStatus(s);
        setStatusLoaded(true);
        if (s.billingRequired) setBillingRequired(true);
        if (s.setupRequired) setSetupRequired(true);
      })
      .catch(() => {
        setStatusLoaded(true);
      });
  }, []);

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

  const handleWorkflowCard = (action: string) => {
    if (action === "ask") {
      // Focus the input
      document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    } else if (action === "meeting-notes") {
      // Navigate to pipeline to pick a target first
      setLocation("/pipeline?ai=meeting-notes");
    } else if (action === "opportunity-brief") {
      setLocation("/pipeline?ai=opportunity-brief");
    } else if (action === "weekly-brief") {
      setLocation("/weekly-review?ai=brief");
    }
  };

  // ── Setup required (key missing) — full-page state ────────────────────────
  if (setupRequired && !billingRequired) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-border/60 p-4 flex items-center gap-2.5 bg-background/80 backdrop-blur-sm">
          <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Bot size={14} className="text-primary" />
          </div>
          <h1 className="font-mono uppercase text-sm tracking-tight font-bold">Ringside Copilot</h1>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-muted border border-border/60">
              <AlertTriangle size={22} className="text-muted-foreground" />
            </div>
            <h2 className="font-semibold text-lg">AI Not Configured</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              An{" "}
              <code className="text-xs bg-muted border border-border/60 px-1.5 py-0.5 rounded-md font-mono">OPENAI_API_KEY</code>{" "}
              secret must be set to enable AI features. Contact your administrator.
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
        <div className="flex-1 min-w-0">
          <h1 className="font-mono uppercase text-sm tracking-tight font-bold">Ringside Copilot</h1>
          <p className="text-[11px] text-muted-foreground hidden md:block mt-0.5">
            Ask read-only questions about the pipeline, actions, risks, and weekly review data.
          </p>
        </div>
        <span className="text-[10px] text-muted-foreground/70 font-mono ml-2 bg-muted/60 border border-border/50 px-2 py-0.5 rounded-md shrink-0">
          Read-Only
        </span>
      </div>

      {/* AI Status card */}
      {statusLoaded && aiStatus && (
        <div className={`shrink-0 mx-4 mt-3 px-3.5 py-2.5 rounded-xl border text-[11px] font-mono flex items-center gap-2 ${
          aiStatus.available
            ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600"
            : billingRequired
            ? "bg-amber-500/5 border-amber-500/20 text-amber-600"
            : "bg-muted border-border/60 text-muted-foreground"
        }`}>
          {aiStatus.available
            ? <CheckCircle2 size={12} className="shrink-0" />
            : billingRequired
            ? <CreditCard size={12} className="shrink-0" />
            : <AlertTriangle size={12} className="shrink-0" />}
          <span>
            {aiStatus.available
              ? `AI Ready · ${aiStatus.model ?? "gpt-4o"}`
              : billingRequired
              ? "AI workflows are built and ready. Add OpenAI API credits to activate them."
              : "API key missing — contact your administrator to configure AI."}
          </span>
        </div>
      )}

      {/* Billing required banner */}
      {billingRequired && (
        <div className="shrink-0 mx-4 mt-2 px-3.5 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-[12px] text-amber-700 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles size={13} className="text-amber-500" />
            AI workflows are built and ready
          </div>
          <p className="text-amber-600/80 leading-relaxed">
            Meeting notes parsing, opportunity briefs, weekly review briefs, and pipeline Q&A are all configured.
            Add OpenAI API credits to your account to activate them.
          </p>
        </div>
      )}

      {/* Message area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && !isLoading && (
          <div className="space-y-6 pt-4">
            {/* AI Workflow Cards */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-3 text-center">
                AI Workflows
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
                {AI_WORKFLOW_CARDS.map((card) => (
                  <button
                    key={card.id}
                    onClick={() => handleWorkflowCard(card.action)}
                    disabled={billingRequired}
                    className={`text-left px-4 py-3.5 rounded-xl border transition-all duration-150 space-y-1 ${
                      billingRequired
                        ? "border-border/40 bg-card/50 opacity-50 cursor-not-allowed"
                        : "border-border/60 bg-card hover:bg-muted/30 hover:border-border hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {card.icon}
                      <span className="text-sm font-medium">{card.title}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
                      {card.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 max-w-2xl mx-auto">
              <div className="flex-1 h-px bg-border/40" />
              <span className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider">
                or ask a question
              </span>
              <div className="flex-1 h-px bg-border/40" />
            </div>

            {/* Suggested prompts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSubmit(prompt)}
                  disabled={billingRequired}
                  className={`text-left text-sm px-3.5 py-2.5 rounded-xl border transition-all duration-150 text-muted-foreground ${
                    billingRequired
                      ? "border-border/40 bg-card/50 opacity-50 cursor-not-allowed"
                      : "border-border/60 bg-card hover:bg-muted/30 hover:text-foreground hover:border-border"
                  }`}
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
        {billingRequired && (
          <div className="mb-2 text-[11px] text-amber-600/80 font-mono text-center">
            Add OpenAI credits to enable AI Q&amp;A
          </div>
        )}
        <div className="flex gap-2 items-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your pipeline… (Enter to send)"
            className="resize-none rounded-xl min-h-[44px] max-h-32 text-sm border-border/70 bg-card focus-visible:ring-primary/30"
            rows={1}
            disabled={isLoading || billingRequired}
          />
          <Button
            size="sm"
            onClick={() => handleSubmit(input)}
            disabled={!input.trim() || isLoading || billingRequired}
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
