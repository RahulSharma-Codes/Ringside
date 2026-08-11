import React, { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateTarget, useListUsers, getListUsersQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, Save, Shield, ChevronDown, ChevronRight, Check, ChevronsUpDown } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const DEAL_TYPES = [
  "Acquisition",
  "Minority Investment",
  "Divestiture",
  "JV",
  "Partnership",
  "Strategic Alliance",
  "Other",
] as const;

const ENTITY_OPTIONS = [
  { value: "MTL",  label: "MTL — Manipal Technologies Limited" },
  { value: "MPi",  label: "MPi — Manipal Payment & Identity Solutions" },
  { value: "PIPL", label: "PIPL — Primacy Industries Private Limited" },
  { value: "MGPS", label: "MGPS — Manipal Global Print Solutions" },
  { value: "MMNL", label: "MMNL — Manipal Media Network Limited" },
  { value: "MEIL", label: "MEIL — Manipal Energy & Infrastructures Limited" },
  { value: "MBS",  label: "MBS — Manipal Business Solutions" },
  { value: "MFPL", label: "MFPL — Manipal Fintech Private Limited" },
  { value: "MDS",  label: "MDS — Manipal Digital Solutions" },
  { value: "ADS",  label: "ADS — Adsyndicate Services Private Limited" },
  { value: "WEPL", label: "WEPL — Westtek Enterprises Private Limited" },
  { value: "EKAM", label: "EKAM" },
  { value: "ABPL", label: "ABPL — Aromee Brands Pvt. Ltd." },
  { value: "ES",   label: "ES — CrossFraud" },
] as const;

const formSchema = z.object({
  projectName: z.string().min(2, "Project name is required"),
  targetCode: z.string().min(2, "Target code is required"),
  legalName: z.string().optional(),
  sector: z.string().optional(),
  subsector: z.string().optional(),
  country: z.string().optional(),
  geographyRegion: z.string().optional(),
  entity: z.enum(["MTL", "MPi", "PIPL", "MGPS", "MMNL", "MEIL", "MBS", "MFPL", "MDS", "ADS", "WEPL", "EKAM", "ABPL", "ES"]).optional(),
  dealOwner: z.string().optional(),
  dealOwnerId: z.string().uuid().nullable().optional(),
  dealChampion: z.string().optional(),
  executiveSponsor: z.string().optional(),
  sourcingChannel: z.string().optional(),
  sourcingFirm: z.string().optional(),
  dealType: z.string().optional(),
  priorityTier: z.string().default("Watchlist"),
  strategicFitScore: z.number().min(0).max(100).optional(),
  synergyScore: z.number().min(0).max(100).optional(),
  financialAttractivenessScore: z.number().min(0).max(100).optional(),
  processMaturityScore: z.number().min(0).max(100).optional(),
  riskPenaltyScore: z.number().min(0).max(100).optional(),
  isConfidential: z.boolean().default(true),
  strategicRationale: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewTarget() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createTarget = useCreateTarget();
  const [scoringOpen, setScoringOpen] = useState(false);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const { data: teamMembers = [] } = useListUsers({
    query: { queryKey: getListUsersQueryKey() },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectName: "",
      targetCode: "",
      priorityTier: "Watchlist",
      isConfidential: true,
    }
  });

  function onSubmit(data: FormValues) {
    const scorePayload = scoringOpen ? {
      strategicFitScore: data.strategicFitScore ?? 50,
      synergyScore: data.synergyScore ?? 50,
      financialAttractivenessScore: data.financialAttractivenessScore ?? 50,
      processMaturityScore: data.processMaturityScore ?? 50,
      riskPenaltyScore: data.riskPenaltyScore ?? 0,
    } : {};
    createTarget.mutate({
      data: {
        ...data,
        dealOwnerId: data.dealOwnerId ?? null,
        ...scorePayload,
      }
    }, {
      onSuccess: (res) => {
        toast({
          title: "Target Created",
          description: "New evaluation record established.",
        });
        setLocation(`/targets/${res.id}`);
      },
      onError: () => {
        toast({
          title: "Error",
          description: "Failed to create target. Check console.",
          variant: "destructive",
        });
      }
    });
  }

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-8 space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => window.history.back()} className="rounded-sm">
          <ArrowLeft size={16} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold font-sans tracking-tight">New Deal</h1>
          <p className="text-sm text-muted-foreground">Initialize a new deal profile in the pipeline</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
                <CardHeader className="border-b border-border pb-4">
                  <CardTitle className="font-sans font-semibold text-sm text-primary">Core Identity</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="projectName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Project Code Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Project Apollo" className="rounded-sm bg-background/50 font-medium" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="targetCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Identifier *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. APO-001" className="rounded-sm bg-background/50 uppercase font-mono" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="legalName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Legal Entity Name (if known)</FormLabel>
                        <FormControl>
                          <Input placeholder="Leave blank if confidential" className="rounded-sm bg-background/50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="strategicRationale"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Strategic Rationale</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Why are we evaluating this target? What is the core thesis?"
                            className="min-h-[120px] rounded-sm bg-background/50 resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
                <CardHeader className="border-b border-border pb-4">
                  <CardTitle className="font-sans font-semibold text-sm text-primary">Categorization</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sector"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sector</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Fintech, Healthcare" className="rounded-sm bg-background/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="subsector"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Subsector</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Payments, Insurtech" className="rounded-sm bg-background/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Country</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. India, US, UK" className="rounded-sm bg-background/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="geographyRegion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Region</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. South Asia, EMEA" className="rounded-sm bg-background/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="dealType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Deal Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                            <FormControl>
                              <SelectTrigger className="rounded-sm bg-background/50">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-sm">
                              {DEAL_TYPES.map((dt) => (
                                <SelectItem key={dt} value={dt}>{dt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="entity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Entity</FormLabel>
                          <Select onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)} value={field.value ?? "__none__"}>
                            <FormControl>
                              <SelectTrigger className="rounded-sm bg-background/50">
                                <SelectValue placeholder="Select entity" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="rounded-sm max-h-60 overflow-y-auto">
                              <SelectItem value="__none__">— None —</SelectItem>
                              {ENTITY_OPTIONS.map((e) => (
                                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
                <CardHeader className="border-b border-border pb-4">
                  <CardTitle className="font-sans font-semibold text-sm text-primary">Deal Team &amp; Origination</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <FormField
                    control={form.control}
                    name="dealOwnerId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Deal Owner</FormLabel>
                        <FormControl>
                          <Popover open={ownerPickerOpen} onOpenChange={setOwnerPickerOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full rounded-sm bg-background/50 h-9 text-sm justify-between font-normal"
                                type="button"
                              >
                                <span className="truncate text-left">
                                  {field.value
                                    ? (() => {
                                        const u = (teamMembers as any[]).find((m: any) => m.id === field.value);
                                        return u ? (u.displayName || u.email) : "Unknown user";
                                      })()
                                    : <span className="text-muted-foreground/50">Select team member…</span>}
                                </span>
                                <ChevronsUpDown size={12} className="shrink-0 text-muted-foreground/50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[260px] p-0 rounded-sm" align="start">
                              <Command>
                                <CommandInput placeholder="Search…" className="h-8 text-xs" />
                                <CommandList>
                                  <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No users found</CommandEmpty>
                                  <CommandGroup>
                                    {(teamMembers as any[]).map((u: any) => (
                                      <CommandItem
                                        key={u.id}
                                        value={u.displayName || u.email}
                                        onSelect={() => {
                                          field.onChange(u.id);
                                          setOwnerPickerOpen(false);
                                        }}
                                        className="text-xs gap-2"
                                      >
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[8px] font-bold uppercase shrink-0">
                                          {(u.displayName || u.email).slice(0, 2).toUpperCase()}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium truncate">{u.displayName || u.email}</div>
                                          {u.displayName && <div className="text-[10px] text-muted-foreground truncate">{u.email}</div>}
                                        </div>
                                        {field.value === u.id && <Check size={12} className="text-primary shrink-0" />}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                  {field.value && (
                                    <CommandGroup>
                                      <CommandItem
                                        value="__clear__"
                                        onSelect={() => {
                                          field.onChange(null);
                                          setOwnerPickerOpen(false);
                                        }}
                                        className="text-xs text-destructive/70"
                                      >
                                        Clear owner
                                      </CommandItem>
                                    </CommandGroup>
                                  )}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="dealChampion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Deal Champion</FormLabel>
                          <FormControl>
                            <Input placeholder="Internal champion" className="rounded-sm bg-background/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="executiveSponsor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Executive Sponsor</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. CEO, CFO" className="rounded-sm bg-background/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="sourcingChannel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sourcing Channel</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Direct, IB, VC" className="rounded-sm bg-background/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sourcingFirm"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sourcing Firm</FormLabel>
                          <FormControl>
                            <Input placeholder="Advisor / bank name" className="rounded-sm bg-background/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Scoring (optional) — collapsible, closed by default */}
              <Collapsible open={scoringOpen} onOpenChange={setScoringOpen}>
                <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="border-b border-border pb-4 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-sm">
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-sans font-semibold text-sm text-muted-foreground">
                          Scoring <span className="text-[10px] font-sans normal-case tracking-normal font-normal text-muted-foreground/60 ml-1">(optional — can be added later)</span>
                        </CardTitle>
                        {scoringOpen ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-6 space-y-6">
                      <p className="text-[11px] text-muted-foreground font-mono">
                        Scores can be refined as the deal progresses. Default values are treated as "not assessed" for early-stage targets.
                      </p>
                      {[
                        { name: "strategicFitScore" as const, label: "Strategic Fit", description: "Alignment with strategic priorities." },
                        { name: "synergyScore" as const, label: "Synergy Potential", description: "Revenue, cost, or capability synergies." },
                        { name: "financialAttractivenessScore" as const, label: "Financial Attractiveness", description: "Financial profile and return potential." },
                        { name: "processMaturityScore" as const, label: "Process Maturity", description: "Operational and integration readiness." },
                        { name: "riskPenaltyScore" as const, label: "Risk Penalty", description: "Downward adjustment for execution risk." },
                      ].map(({ name, label, description }) => (
                        <FormField
                          key={name}
                          control={form.control}
                          name={name}
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex justify-between items-center mb-2">
                                <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</FormLabel>
                                <span className="font-mono font-bold text-primary text-sm">{field.value ?? 50}/100</span>
                              </div>
                              <FormControl>
                                <Slider
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={[field.value ?? 50]}
                                  onValueChange={(vals) => field.onChange(vals[0])}
                                  className="py-2"
                                />
                              </FormControl>
                              <FormDescription className="text-[10px] font-mono mt-1">{description}</FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            <div className="space-y-6">
              <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
                <CardHeader className="border-b border-border pb-4">
                  <CardTitle className="font-sans font-semibold text-sm text-primary">Initial Assessment</CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  <FormField
                    control={form.control}
                    name="priorityTier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Priority Tier</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger className="rounded-sm bg-background/50">
                              <SelectValue placeholder="Select tier" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="rounded-sm">
                            <SelectItem value="Must-Win">Must-Win</SelectItem>
                            <SelectItem value="Priority 1">Priority 1</SelectItem>
                            <SelectItem value="Priority 2">Priority 2</SelectItem>
                            <SelectItem value="Watchlist">Watchlist</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isConfidential"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-sm border border-border p-4 bg-background/30">
                        <div className="space-y-0.5">
                          <FormLabel className="font-mono text-xs flex items-center gap-2 uppercase tracking-wider text-amber-500">
                            <Shield size={14} /> Strict Confidentiality
                          </FormLabel>
                          <FormDescription className="text-[10px]">
                            Restricts visibility to deal team only.
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <Button type="submit" disabled={createTarget.isPending} className="w-full rounded-sm font-mono uppercase tracking-widest text-[11px] gap-2 h-12">
                {createTarget.isPending ? "Processing..." : (
                  <>
                    <Save size={16} />
                    Commit Record
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </Form>
    </div>
  );
}
