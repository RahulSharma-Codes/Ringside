import React, { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import {
  Bot, Send, AlertTriangle, Loader2, Sparkles, CheckCircle2,
  CreditCard, FileText, CalendarCheck, Zap, KeyRound, Copy, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { customFetch } from "@workspace/api-client-react";
import { useListTargets, getListTargetsQueryKey } from "@workspace/api-client-react";

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
  status: "available" | "key_missing" | "key_invalid" | "billing" | "transient";
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

  const [weeklyBriefOpen, setWeeklyBriefOpen] = useState(false);
  const [weeklyBriefLoading, setWeeklyBriefLoading] = useState(false);
  const [weeklyBriefContent, setWeeklyBriefContent] = useState<string | null>(null);
  const [weeklyBriefError, setWeeklyBriefError] = useState<string | null>(null);
  const [weeklyBriefCopied, setWeeklyBriefCopied] = useState(false);

  const [targetPickerOpen, setTargetPickerOpen] = useState(false);
  const { data: targetsList } = useListTargets(
    undefined,
    { query: { queryKey: getListTargetsQueryKey(), enabled: targetPickerOpen } },
  );

  // Fetch AI status once on mount
  useEffect(() => {
    customFetch<AiStatusResponse>("/api/ai/status")
      .then((s) => {
        setAiStatus(s);
        setStatusLoaded(true);
        if (s.status === "billing") setBillingRequired(true);
        if (s.status === "key_missing" || s.status === "key_invalid") setSetupRequired(true);
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

  const handleGenerateWeeklyBrief = async () => {
    setWeeklyBriefOpen(true);
    setWeeklyBriefLoading(true);
    setWeeklyBriefContent(null);
    setWeeklyBriefError(null);
    try {
      const resp = await customFetch<{
        brief: string | null;
        setupRequired?: boolean;
        billingRequired?: boolean;
        error?: string;
      }>("/api/ai/weekly-brief", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (resp.setupRequired) { setWeeklyBriefError("AI not configured. Add an OPENAI_API_KEY secret to activate."); return; }
      if (resp.billingRequired) { setWeeklyBriefError("Add OpenAI API credits to your account to generate briefs."); return; }
      setWeeklyBriefContent(resp.brief ?? "No brief generated.");
    } catch {
      setWeeklyBriefError("Failed to generate brief. Please try again.");
    } finally {
      setWeeklyBriefLoading(false);
    }
  };

  const handleWorkflowCard = (action: string) => {
    if (action === "ask") {
      document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    } else if (action === "meeting-notes") {
      setLocation("/pipeline?ai=meeting-notes");
    } else if (action === "opportunity-brief") {
      setTargetPickerOpen(true);
    } else if (action === "weekly-brief") {
      handleGenerateWeeklyBrief();
    }
  };


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
      {statusLoaded && aiStatus && (() => {
        const s = aiStatus.status;
        const cfg = s === "available"
          ? { cls: "bg-emerald-500/5 border-emerald-500/20 text-emerald-600", icon: <CheckCircle2 size={12} className="shrink-0" />, label: `AI Ready · ${aiStatus.model ?? "gpt-4o"}` }
          : s === "billing"
          ? { cls: "bg-amber-500/5 border-amber-500/20 text-amber-600", icon: <CreditCard size={12} className="shrink-0" />, label: "Billing issue — add OpenAI API credits to activate AI." }
          : s === "key_invalid"
          ? { cls: "bg-destructive/5 border-destructive/20 text-destructive", icon: <KeyRound size={12} className="shrink-0" />, label: "API key invalid — the key was rejected by OpenAI (401)." }
          : s === "transient"
          ? { cls: "bg-muted border-border/60 text-muted-foreground", icon: <AlertTriangle size={12} className="shrink-0" />, label: "AI status temporarily unavailable — will re-check on next request." }
          : { cls: "bg-muted border-border/60 text-muted-foreground", icon: <AlertTriangle size={12} className="shrink-0" />, label: "API key not configured — contact your administrator." };
        return (
          <div className={`shrink-0 mx-4 mt-3 px-3.5 py-2.5 rounded-xl border text-[11px] font-mono flex items-center gap-2 ${cfg.cls}`}>
            {cfg.icon}
            <span>{cfg.label}</span>
          </div>
        );
      })()}

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

      {/* Setup required banner */}
      {setupRequired && !billingRequired && (
        <div className="shrink-0 mx-4 mt-2 px-3.5 py-3 rounded-xl border border-border/40 bg-muted/40 text-[12px] text-muted-foreground space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-foreground/70">
            <Sparkles size={13} className="text-muted-foreground" />
            AI workflows are built and ready
          </div>
          <p className="leading-relaxed">
            Meeting notes parsing, opportunity briefs, weekly review briefs, and pipeline Q&A are all available.
            Add an <code className="text-[10px] bg-background border border-border/60 px-1 py-px rounded font-mono">OPENAI_API_KEY</code> secret to activate them.
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
                    disabled={billingRequired || setupRequired}
                    className={`text-left px-4 py-3.5 rounded-xl border transition-all duration-150 space-y-1 ${
                      billingRequired || setupRequired
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
                  disabled={billingRequired || setupRequired}
                  className={`text-left text-sm px-3.5 py-2.5 rounded-xl border transition-all duration-150 text-muted-foreground ${
                    billingRequired || setupRequired
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
            disabled={isLoading || billingRequired || setupRequired}
          />
          <Button
            size="sm"
            onClick={() => handleSubmit(input)}
            disabled={!input.trim() || isLoading || billingRequired || setupRequired}
            className="rounded-xl shrink-0 h-[44px] w-[44px] p-0"
          >
            <Send size={15} />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground/60 font-mono mt-2 leading-relaxed">
          AI answers are generated from live pipeline data. Review before acting.
        </p>
      </div>

      {/* Inline target picker for opportunity brief */}
      <Dialog open={targetPickerOpen} onOpenChange={setTargetPickerOpen}>
        <DialogContent className="max-w-md w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <Zap size={15} className="text-emerald-500" />
              Select a deal for the opportunity brief
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-72">
            {!targetsList || targetsList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active targets found.</p>
            ) : (
              <div className="space-y-1 pr-1">
                {targetsList.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTargetPickerOpen(false);
                      setLocation(`/targets/${t.id}?ai=brief`);
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted/60 border border-transparent hover:border-border/50 transition-all duration-100 group"
                  >
                    <div className="text-sm font-medium group-hover:text-primary transition-colors">{t.projectName}</div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      {t.targetCode} · {t.currentStage ?? "Unknown stage"}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Inline weekly brief dialog */}
      <Dialog open={weeklyBriefOpen} onOpenChange={(open) => { setWeeklyBriefOpen(open); if (!open) { setWeeklyBriefContent(null); setWeeklyBriefError(null); } }}>
        <DialogContent className="max-w-2xl w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold">
              <CalendarCheck size={15} className="text-blue-500" />
              Weekly Review Brief
            </DialogTitle>
          </DialogHeader>
          {weeklyBriefLoading && (
            <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" />
              <span className="text-sm">Generating brief…</span>
            </div>
          )}
          {weeklyBriefError && !weeklyBriefLoading && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              <AlertTriangle size={13} className="shrink-0" />
              {weeklyBriefError}
            </div>
          )}
          {weeklyBriefContent && !weeklyBriefLoading && (
            <>
              <ScrollArea className="max-h-[60vh] pr-2">
                <div className="prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed whitespace-pre-wrap">
                  {weeklyBriefContent}
                </div>
              </ScrollArea>
              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(weeklyBriefContent).catch(() => {});
                    setWeeklyBriefCopied(true);
                    setTimeout(() => setWeeklyBriefCopied(false), 2000);
                  }}
                >
                  {weeklyBriefCopied ? <Check size={12} /> : <Copy size={12} />}
                  {weeklyBriefCopied ? "Copied" : "Copy"}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
