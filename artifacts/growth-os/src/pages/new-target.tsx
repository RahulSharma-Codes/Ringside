import React, { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateTarget } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, Save, Shield, ChevronDown, ChevronRight } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const DEAL_TYPES = [
  "Platform Acquisition",
  "Bolt-On Acquisition",
  "Joint Venture",
  "Merger",
  "Minority Stake",
  "Divestiture",
  "Other",
] as const;

const formSchema = z.object({
  projectName: z.string().min(2, "Project name is required"),
  targetCode: z.string().min(2, "Target code is required"),
  legalName: z.string().optional(),
  sector: z.string().optional(),
  country: z.string().optional(),
  dealOwner: z.string().optional(),
  dealType: z.string().optional(),
  priorityTier: z.string().default("Watchlist"),
  strategicFitScore: z.number().min(0).max(100).default(50),
  synergyScore: z.number().min(0).max(100).default(50),
  financialAttractivenessScore: z.number().min(0).max(100).default(50),
  processMaturityScore: z.number().min(0).max(100).default(50),
  riskPenaltyScore: z.number().min(0).max(100).default(0),
  isConfidential: z.boolean().default(true),
  strategicRationale: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function NewTarget() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const createTarget = useCreateTarget();
  const [scoringOpen, setScoringOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      projectName: "",
      targetCode: "",
      priorityTier: "Watchlist",
      strategicFitScore: 50,
      synergyScore: 50,
      financialAttractivenessScore: 50,
      processMaturityScore: 50,
      riskPenaltyScore: 0,
      isConfidential: true,
    }
  });

  function onSubmit(data: FormValues) {
    createTarget.mutate({
      data: {
        ...data,
        strategicFitScore: data.strategicFitScore,
        synergyScore: data.synergyScore,
        financialAttractivenessScore: data.financialAttractivenessScore,
        processMaturityScore: data.processMaturityScore,
        riskPenaltyScore: data.riskPenaltyScore,
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
          <h1 className="text-2xl font-bold font-mono tracking-tight uppercase">New Opportunity</h1>
          <p className="text-sm text-muted-foreground">Initialize a new target profile in the pipeline</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
                <CardHeader className="border-b border-border pb-4">
                  <CardTitle className="font-mono text-sm uppercase tracking-wider text-primary">Core Identity</CardTitle>
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
                  <CardTitle className="font-mono text-sm uppercase tracking-wider text-primary">Categorization</CardTitle>
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
                      name="country"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Geography</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. US, UK, DE" className="rounded-sm bg-background/50" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="dealOwner"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Lead Owner</FormLabel>
                        <FormControl>
                          <Input placeholder="Deal Lead Name" className="rounded-sm bg-background/50" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dealType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Deal Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                          <FormControl>
                            <SelectTrigger className="rounded-sm bg-background/50">
                              <SelectValue placeholder="Select type (optional)" />
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
                </CardContent>
              </Card>

              {/* Scoring (optional) — collapsible, closed by default */}
              <Collapsible open={scoringOpen} onOpenChange={setScoringOpen}>
                <Card className="bg-card/50 backdrop-blur border-border rounded-sm">
                  <CollapsibleTrigger asChild>
                    <CardHeader className="border-b border-border pb-4 cursor-pointer hover:bg-muted/20 transition-colors rounded-t-sm">
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-mono text-sm uppercase tracking-wider text-muted-foreground">
                          Scoring <span className="text-[10px] normal-case tracking-normal font-normal text-muted-foreground/60 ml-1">(optional — can be added later)</span>
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
                                <span className="font-mono font-bold text-primary text-sm">{field.value}/100</span>
                              </div>
                              <FormControl>
                                <Slider
                                  min={0}
                                  max={100}
                                  step={1}
                                  value={[field.value]}
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
                  <CardTitle className="font-mono text-sm uppercase tracking-wider text-primary">Initial Assessment</CardTitle>
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
