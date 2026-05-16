import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useApproval } from "@/hooks/use-approval";
import { useLockedFeatureGuard } from "@/components/LockedFeature";
import {
  useListSheets,
  useGetSheetData,
  useListSlideTemplates,
  useGetSlidePlaceholders,
  useCreateBatch,
  getListBatchesQueryKey,
  customFetch,
  useListBuiltinTemplates,
  useGetBuiltinTemplate,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Presentation, ChevronRight, CheckCircle2, Loader2, Link2, Send, Layers, PenTool } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";

const STEPS = [
  "Name & Details",
  "Select Data Source",
  "Select Template",
  "Map Data",
  "Email Settings",
  "Review & Create"
];

export default function NewBatchWizard() {
  const [step, setStep] = useState(0);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Wizard State
  const [name, setName] = useState("");

  const [sheetId, setSheetId] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [tabName, setTabName] = useState("");

  const { recheckGoogleAuth, hasGoogleAuth, connectGoogle } = useAuth();
  const { isApproved } = useApproval();
  const slidesGuard = useLockedFeatureGuard("Google Slides templates");

  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  // Default unapproved users to the builtin editor (Slides is locked).
  const [templateKind, setTemplateKind] = useState<"slides" | "builtin">(
    isApproved ? "slides" : "builtin",
  );

  // Snap to builtin if approval state changes after mount
  useEffect(() => {
    if (!isApproved && templateKind === "slides") {
      setTemplateKind("builtin");
      setTemplateId("");
      setTemplateName("");
    }
  }, [isApproved, templateKind]);

  // Multi-template routing (slides within one presentation)
  const [multiTemplateMode, setMultiTemplateMode] = useState(false);
  const [categoryColumn, setCategoryColumn] = useState("");
  const [categorySlideMap, setCategorySlideMap] = useState<Record<string, number>>({});
  const [defaultSlideIndex, setDefaultSlideIndex] = useState<number>(0);

  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [emailColumn, setEmailColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");

  const [emailSubject, setEmailSubject] = useState("Your Certificate is ready!");
  const [emailBody, setEmailBody] = useState("Hi ,\n\nHere is your certificate attached.\n\nBest,\nThe Team");
  const [authToken, setAuthToken] = useState<string>("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (token) setAuthToken(token);
    });
  }, []);

  // API Queries
  const { data: sheetsRes, isLoading: sheetsLoading } = useListSheets();
  const { data: sheetData, isLoading: sheetDataLoading } = useGetSheetData(sheetId, { tabName }, { query: { enabled: !!sheetId } as any });

  // Unique category values from sheet data (for multi-template mode)
  const uniqueCategories = (() => {
    if (!categoryColumn || !sheetData?.rows) return [] as string[];
    const values = (sheetData.rows as Record<string, string>[]).map(r => r[categoryColumn]).filter(Boolean);
    return [...new Set(values)] as string[];
  })();
  const { data: templatesRes, isLoading: templatesLoading } = useListSlideTemplates();
  const { data: builtinTemplatesRes, isLoading: builtinTemplatesLoading } = useListBuiltinTemplates();
  const { data: slidesPlaceholdersRes, isLoading: slidesPlaceholdersLoading } = useGetSlidePlaceholders(
    templateKind === "slides" ? templateId : "",
    { query: { enabled: templateKind === "slides" && !!templateId } as any },
  );
  const { data: builtinDetailRes, isLoading: builtinDetailLoading } = useGetBuiltinTemplate(
    templateKind === "builtin" ? templateId : "",
    { query: { enabled: templateKind === "builtin" && !!templateId } as any },
  );

  const placeholdersRes =
    templateKind === "builtin"
      ? builtinDetailRes
        ? { placeholders: builtinDetailRes.placeholders }
        : undefined
      : slidesPlaceholdersRes;
  const placeholdersLoading =
    templateKind === "builtin" ? builtinDetailLoading : slidesPlaceholdersLoading;

  // Fetch slide info for the selected template (for multi-template mode)
  const { data: slidesInfoRes, isLoading: slidesInfoLoading } = useQuery({
    queryKey: [`/api/slides/${templateId}/slides-info`],
    queryFn: () => customFetch<{ slides: Array<{ index: number; objectId: string; thumbnailUrl: string | null }> }>(`/api/slides/${templateId}/slides-info`, { method: "GET" }),
    enabled: !!templateId && multiTemplateMode,
  });
  const slidesInfo = slidesInfoRes?.slides ?? [];

  const { mutate: createBatch, isPending: creating } = useCreateBatch({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() });
        toast({ title: "Batch created!" });
        setLocation(`/batches/${data.id}`);
      },
      onError: (error: any) => {
        const code = error?.data?.code ?? error?.code;
        if (code === "GOOGLE_TOKEN_EXPIRED" || code === "GOOGLE_NOT_CONNECTED") {
          recheckGoogleAuth();
          toast({
            title: "Google account not connected",
            description: "Connect your Google account in Settings to continue.",
            variant: "destructive",
            action: <ToastAction altText="Go to Settings" onClick={() => setLocation("/settings")}>Go to Settings</ToastAction>,
          });
          return;
        }
        toast({ title: "Failed to create batch", description: error.message, variant: "destructive" });
      }
    }
  });

  const handleNext = () => setStep(s => Math.min(STEPS.length - 1, s + 1));
  const handlePrev = () => setStep(s => Math.max(0, s - 1));

  const submitBatch = () => {
    // Build the categorySlideMap including the default mapping
    const finalSlideMap: Record<string, number> = { ...categorySlideMap };
    if (multiTemplateMode) {
      // Use sentinel key for default (Firestore reserves __ prefixed names)
      finalSlideMap["_default"] = defaultSlideIndex;
    }

    createBatch({
      data: {
        name,
        sheetId,
        sheetName,
        tabName,
        templateId,
        templateName,
        templateKind,
        columnMap,
        emailColumn,
        nameColumn,
        emailSubject,
        emailBody,
        ...(multiTemplateMode && categoryColumn ? { categoryColumn, categorySlideMap: finalSlideMap } : {}),
      } as any
    });
  };

  const isNextDisabled = () => {
    if (step === 0) return !name;
    if (step === 1) return !sheetId;
    if (step === 2) {
      if (!templateId) return true;
      if (multiTemplateMode && !categoryColumn) return true;
      if (multiTemplateMode && categoryColumn && uniqueCategories.length > 0) {
        // Check all categories are mapped
        return !uniqueCategories.every(cat => cat in categorySlideMap);
      }
      return false;
    }
    if (step === 3) return !emailColumn || !nameColumn || Object.keys(columnMap).length < (placeholdersRes?.placeholders?.length || 0);
    return false;
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-2 sm:py-8 pb-3 sm:pb-8 flex flex-col h-[calc(100dvh-4rem)] sm:h-auto">
      {/* Stepper Header */}
      <div className="mb-3 sm:mb-10 shrink-0">
        <h1 className="text-2xl sm:text-3xl font-display font-bold mb-2 sm:mb-6">Create New Batch</h1>
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-secondary rounded-full -z-10" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-all duration-500 ease-out -z-10"
            style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
          />
          {STEPS.map((label, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1 sm:gap-2">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-semibold transition-colors duration-300 ${step > idx ? "bg-primary text-primary-foreground" :
                  step === idx ? "bg-primary ring-4 ring-primary/20 text-primary-foreground" :
                    "bg-secondary text-muted-foreground"
                }`}>
                {step > idx ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> : idx + 1}
              </div>
              <span className={`text-xs font-medium hidden md:block ${step >= idx ? "text-foreground" : "text-muted-foreground"}`}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <Card className="border-border/50 shadow-lg shadow-black/5 overflow-hidden relative flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="p-4 sm:p-6 md:p-8"
          >
            {/* STEP 0: Name */}
            {step === 0 && (
              <div className="space-y-4 sm:space-y-6 max-w-xl">
                <div>
                  <h2 className="text-xl sm:text-2xl font-display font-semibold mb-1 sm:mb-2">Name this batch</h2>
                  <p className="text-sm sm:text-base text-muted-foreground">Give your automation a recognizable name to find it later.</p>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="name">Batch Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Q3 Leadership Training"
                    className="h-12 text-lg px-4"
                  />
                </div>
              </div>
            )}

            {/* STEP 1: Sheets */}
            {step === 1 && (
              <div className="space-y-3 sm:space-y-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-display font-semibold mb-1 sm:mb-2">Select Google Sheet</h2>
                  <p className="text-sm sm:text-base text-muted-foreground">Choose the spreadsheet containing your recipient data.</p>
                </div>
                {!hasGoogleAuth ? (
                  <div className="flex flex-col items-center justify-center gap-4 py-12 border-2 border-dashed border-border rounded-xl text-center">
                    <FileSpreadsheet className="w-10 h-10 text-muted-foreground" />
                    <div>
                      <p className="font-bold uppercase tracking-widest text-sm">Google Account Not Connected</p>
                      <p className="text-muted-foreground text-sm mt-1">Connect your Google account to access your spreadsheets.</p>
                    </div>
                    <Button onClick={connectGoogle} className="mt-2">
                      Connect Google Account
                    </Button>
                  </div>
                ) : sheetsLoading ? (
                  <div className="flex items-center gap-3 text-muted-foreground p-8"><Loader2 className="animate-spin" /> Loading sheets...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 p-1">
                    {sheetsRes?.sheets.map(sheet => (
                      <div
                        key={sheet.id}
                        onClick={() => { setSheetId(sheet.id); setSheetName(sheet.name); }}
                        className={`p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-all hover-elevate ${sheetId === sheet.id ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-border/50 bg-card hover:border-primary/30"
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${sheetId === sheet.id ? "bg-primary text-primary-foreground" : "bg-green-100 text-green-700"}`}>
                            <FileSpreadsheet className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="font-semibold text-foreground line-clamp-1">{sheet.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Spreadsheet</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* STEP 2: Templates */}
            {step === 2 && (
              <div className="space-y-3 sm:space-y-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-display font-semibold mb-1 sm:mb-2">Template Setup</h2>
                  <p className="text-sm sm:text-base text-muted-foreground">Choose one template for all recipients, or use multiple slides from a single presentation.</p>
                </div>

                {/* Source kind toggle */}
                <div className="flex gap-3">
                  <button
                    onClick={slidesGuard.guard(() => { setTemplateKind("slides"); setTemplateId(""); setTemplateName(""); setCategorySlideMap({}); })}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${templateKind === "slides" ? "border-primary bg-primary/5 text-foreground" : "border-border/50 text-muted-foreground hover:border-primary/30"} ${!slidesGuard.isApproved ? "opacity-60" : ""}`}
                  >
                    <Presentation className="w-4 h-4" /> Google Slides {!slidesGuard.isApproved && "🔒"}
                  </button>
                  <button
                    onClick={() => { setTemplateKind("builtin"); setTemplateId(""); setTemplateName(""); setMultiTemplateMode(false); setCategorySlideMap({}); }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${templateKind === "builtin" ? "border-primary bg-primary/5 text-foreground" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}
                  >
                    <PenTool className="w-4 h-4" /> Builtin Editor
                  </button>
                </div>
                {slidesGuard.modal}

                {/* Multi-template mode toggle (only for Slides) */}
                {templateKind === "slides" && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setMultiTemplateMode(false); setCategoryColumn(""); setCategorySlideMap({}); }}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${!multiTemplateMode ? "border-primary bg-primary/5 text-foreground" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}
                    >
                      <Presentation className="w-4 h-4" /> Single Template
                    </button>
                    <button
                      onClick={() => setMultiTemplateMode(true)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${multiTemplateMode ? "border-primary bg-primary/5 text-foreground" : "border-border/50 text-muted-foreground hover:border-primary/30"}`}
                    >
                      <Layers className="w-4 h-4" /> Multi Template
                    </button>
                  </div>
                )}

                {templateKind === "builtin" ? (
                  builtinTemplatesLoading ? (
                    <div className="flex items-center gap-3 text-muted-foreground p-8"><Loader2 className="animate-spin" /> Loading builtin templates...</div>
                  ) : (builtinTemplatesRes?.templates?.length ?? 0) === 0 ? (
                    <div className="border border-dashed border-border rounded-2xl p-8 text-center space-y-3">
                      <PenTool className="w-8 h-8 mx-auto text-muted-foreground/60" />
                      <p className="text-sm text-muted-foreground">You don't have any builtin templates yet.</p>
                      <Button variant="outline" onClick={() => setLocation("/templates/builtin/new")}>
                        Open Builtin Editor
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Label className="text-sm mb-2 block">Select a builtin template</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-1">
                        {builtinTemplatesRes?.templates.map((tpl) => (
                          <div
                            key={tpl.id}
                            onClick={() => { setTemplateId(tpl.id); setTemplateName(tpl.name); }}
                            className={`group p-4 rounded-xl border-2 cursor-pointer transition-all hover-elevate flex flex-col gap-4 ${templateId === tpl.id ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-border/50 bg-card hover:border-primary/30"}`}
                          >
                            {tpl.thumbnailUrl ? (
                              <img src={tpl.thumbnailUrl} alt={tpl.name} className="w-full aspect-[3/2] sm:aspect-[4/3] object-contain bg-secondary rounded-lg border border-border/50" />
                            ) : (
                              <div className="w-full aspect-[4/3] bg-secondary rounded-lg flex items-center justify-center">
                                <PenTool className="w-10 h-10 text-muted-foreground/50" />
                              </div>
                            )}
                            <div className="font-semibold text-sm line-clamp-2">{tpl.name}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ) : templatesLoading ? (
                  <div className="flex items-center gap-3 text-muted-foreground p-8"><Loader2 className="animate-spin" /> Loading templates...</div>
                ) : (
                  <>
                    {/* Template picker — shared for both modes */}
                    <div>
                      <Label className="text-sm mb-2 block">{multiTemplateMode ? "Select the presentation containing all slide designs" : "Select a template"}</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-1">
                        {templatesRes?.templates.map(tpl => (
                          <div
                            key={tpl.id}
                            onClick={() => { setTemplateId(tpl.id); setTemplateName(tpl.name); setCategorySlideMap({}); }}
                            className={`group p-4 rounded-xl border-2 cursor-pointer transition-all hover-elevate flex flex-col gap-4 ${templateId === tpl.id ? "border-primary bg-primary/5 ring-4 ring-primary/10" : "border-border/50 bg-card hover:border-primary/30"}`}
                          >
                            {tpl.thumbnailUrl ? (
                              <img src={tpl.thumbnailUrl} alt={tpl.name} className="w-full aspect-[4/3] object-cover rounded-lg border border-border/50" />
                            ) : (
                              <div className="w-full aspect-[4/3] bg-secondary rounded-lg flex items-center justify-center">
                                <Presentation className="w-10 h-10 text-muted-foreground/50" />
                              </div>
                            )}
                            <div className="font-semibold text-sm line-clamp-2">{tpl.name}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Multi-template: slide mapping UI */}
                    {multiTemplateMode && templateId && (
                      <div className="space-y-5 border-t border-border/50 pt-5">
                        {/* Slide preview strip */}
                        {slidesInfoLoading ? (
                          <div className="flex items-center gap-3 text-muted-foreground p-4"><Loader2 className="animate-spin w-4 h-4" /> Loading slides...</div>
                        ) : slidesInfo.length > 0 && (
                          <div>
                            <Label className="text-sm mb-2 block">Slides in this presentation ({slidesInfo.length})</Label>
                            <div className="flex gap-3 overflow-x-auto pb-2">
                              {slidesInfo.map(slide => (
                                <div key={slide.index} className="shrink-0 w-36">
                                  {slide.thumbnailUrl ? (
                                    <img
                                      src={slide.thumbnailUrl}
                                      alt={`Slide ${slide.index + 1}`}
                                      className="w-full aspect-[4/3] object-cover rounded-lg border border-border/50"
                                    />
                                  ) : (
                                    <div className="w-full aspect-[4/3] bg-secondary rounded-lg flex items-center justify-center">
                                      <Presentation className="w-6 h-6 text-muted-foreground/50" />
                                    </div>
                                  )}
                                  <p className="text-xs text-center mt-1 font-medium text-muted-foreground">Slide {slide.index + 1}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Category column selector */}
                        <div className="space-y-2 max-w-sm">
                          <Label>Category Column</Label>
                          <Select value={categoryColumn} onValueChange={(val) => { setCategoryColumn(val); setCategorySlideMap({}); }}>
                            <SelectTrigger className="bg-background"><SelectValue placeholder="Which column holds the category/role?" /></SelectTrigger>
                            <SelectContent>
                              {sheetData?.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">e.g. a column with values like "Winner", "Coordinator", "Participant"</p>
                        </div>

                        {/* Category → Slide mapping */}
                        {categoryColumn && slidesInfo.length > 0 && (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <Label className="text-base">Map Categories → Slides</Label>
                              <span className="text-xs text-muted-foreground">{uniqueCategories.length} categories detected</span>
                            </div>

                            <div className="space-y-2">
                              {uniqueCategories.map(cat => (
                                <div key={cat} className="flex items-center gap-4 bg-secondary/30 p-3 rounded-xl border border-border/50">
                                  <div className="w-40 shrink-0 flex items-center gap-2">
                                    <Layers className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm font-medium truncate">{cat}</span>
                                  </div>
                                  <Select
                                    value={categorySlideMap[cat] != null ? String(categorySlideMap[cat]) : ""}
                                    onValueChange={(val) => {
                                      setCategorySlideMap(prev => ({ ...prev, [cat]: parseInt(val, 10) }));
                                    }}
                                  >
                                    <SelectTrigger className="bg-background flex-1"><SelectValue placeholder="Select slide..." /></SelectTrigger>
                                    <SelectContent>
                                      {slidesInfo.map(slide => (
                                        <SelectItem key={slide.index} value={String(slide.index)}>Slide {slide.index + 1}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {/* Thumbnail preview of selected slide */}
                                  {categorySlideMap[cat] != null && slidesInfo[categorySlideMap[cat]]?.thumbnailUrl && (
                                    <img
                                      src={slidesInfo[categorySlideMap[cat]].thumbnailUrl!}
                                      alt={`Slide ${categorySlideMap[cat] + 1}`}
                                      className="w-16 aspect-[4/3] object-cover rounded-md border border-border/50 shrink-0"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* Default slide for unmatched categories */}
                            <div className="pt-3 border-t border-border/50 space-y-2">
                              <Label className="text-sm">Default Slide <span className="font-normal text-muted-foreground">(for empty or unmatched categories)</span></Label>
                              <div className="flex items-center gap-4">
                                <Select
                                  value={String(defaultSlideIndex)}
                                  onValueChange={(val) => setDefaultSlideIndex(parseInt(val, 10))}
                                >
                                  <SelectTrigger className="bg-background max-w-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {slidesInfo.map(slide => (
                                      <SelectItem key={slide.index} value={String(slide.index)}>Slide {slide.index + 1}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {slidesInfo[defaultSlideIndex]?.thumbnailUrl && (
                                  <img
                                    src={slidesInfo[defaultSlideIndex].thumbnailUrl!}
                                    alt={`Default slide`}
                                    className="w-16 aspect-[4/3] object-cover rounded-md border border-border/50 shrink-0"
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* STEP 3: Map Columns */}
            {step === 3 && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-display font-semibold mb-2">Map Data Fields</h2>
                  <p className="text-muted-foreground">Match the placeholders in your template to columns in your sheet.</p>
                </div>

                {(sheetDataLoading || placeholdersLoading) ? (
                  <div className="flex items-center gap-3 text-muted-foreground p-8"><Loader2 className="animate-spin" /> Loading mapping data...</div>
                ) : (sheetData?.headers.length ?? 0) > 25 ? (
                  <div className="flex flex-col items-center gap-4 py-10 text-center border-2 border-dashed border-border rounded-2xl px-6">
                    <FileSpreadsheet className="w-10 h-10 text-muted-foreground/50" />
                    <div>
                      <p className="font-semibold text-base mb-1">Too many columns to map here</p>
                      <p className="text-sm text-muted-foreground">
                        This sheet has <strong>{sheetData?.headers.length}</strong> columns — more than the wizard can handle.
                        Use the <strong>Advanced Workflow Builder</strong> to connect columns visually.
                      </p>
                    </div>
                    <Button onClick={() => setLocation("/advanced")} className="mt-2">
                      Open Advanced Workflow Builder
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    <div className="space-y-6">
                      <div className="bg-secondary/50 p-5 rounded-2xl border border-border/50 space-y-4">
                        <h3 className="font-semibold text-lg flex items-center gap-2">
                          <Send className="w-5 h-5 text-primary" /> Recipient Config
                        </h3>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>Name Column (Required)</Label>
                            <Select value={nameColumn} onValueChange={setNameColumn}>
                              <SelectTrigger className="bg-background"><SelectValue placeholder="Select name column" /></SelectTrigger>
                              <SelectContent>
                                {sheetData?.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Email Column (Required)</Label>
                            <Select value={emailColumn} onValueChange={setEmailColumn}>
                              <SelectTrigger className="bg-background"><SelectValue placeholder="Select email column" /></SelectTrigger>
                              <SelectContent>
                                {sheetData?.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="font-semibold text-lg">Template Placeholders</h3>
                      <div className="space-y-3 pr-2">
                        {placeholdersRes?.placeholders?.length === 0 ? (
                          <div className="text-muted-foreground text-sm p-4 bg-secondary/50 rounded-lg">No placeholders found in template (like `&lt;&lt;Name&gt;&gt;`)</div>
                        ) : (
                          placeholdersRes?.placeholders?.map(ph => (
                            <div key={ph} className="flex flex-wrap items-center gap-2 sm:gap-4 bg-background p-3 rounded-xl border border-border shadow-sm">
                              <div className="min-w-0 max-w-[40%] text-sm font-mono bg-secondary px-2 py-1 rounded text-center truncate">{ph}</div>
                              <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                              <Select value={columnMap[ph] || ""} onValueChange={(val) => setColumnMap(prev => ({ ...prev, [ph]: val }))}>
                                <SelectTrigger className="flex-1 min-w-[120px] border-0 shadow-none bg-secondary/30"><SelectValue placeholder="Map to column..." /></SelectTrigger>
                                <SelectContent>
                                  {sheetData?.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Email Settings */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-display font-semibold mb-2">Email Configuration</h2>
                  <p className="text-muted-foreground">Design the email that will be sent with each certificate. Use column names like `&lt;&lt;Name&gt;&gt;` to personalize.</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                  <div className="md:col-span-2 space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject Line</Label>
                      <Input
                        id="subject"
                        value={emailSubject}
                        onChange={e => setEmailSubject(e.target.value)}
                        placeholder="e.g. Congratulations, your certificate is ready!"
                        className="transition-all duration-200"
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "copy";
                          const target = e.target as HTMLInputElement;
                          target.focus();

                          // Estimate character position
                          // For a simple input, this works fairly well
                          const rect = target.getBoundingClientRect();
                          const x = e.clientX - rect.left - 12; // 12px for padding
                          const charWidth = 8; // Approximation for standard font
                          const pos = Math.max(0, Math.floor(x / charWidth));
                          target.setSelectionRange(pos, pos);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const target = e.target as HTMLInputElement;
                          const text = e.dataTransfer.getData("text/plain");
                          if (text) {
                            const start = target.selectionStart || 0;
                            const end = target.selectionEnd || 0;
                            const newValue = emailSubject.substring(0, start) + text + emailSubject.substring(end);
                            setEmailSubject(newValue);
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="body">Email Body</Label>
                      <Textarea
                        id="body"
                        value={emailBody}
                        onChange={e => setEmailBody(e.target.value)}
                        rows={12}
                        className="resize-none font-sans leading-relaxed transition-all duration-200"
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "copy";
                          const target = e.target as HTMLTextAreaElement;
                          target.focus();

                          // Exact same logic as Subject (math-based estimation)
                          // but adapted for multiple lines
                          const rect = target.getBoundingClientRect();
                          const x = e.clientX - rect.left - 12; // 12px for padding
                          const y = e.clientY - rect.top - 12;  // 12px for padding

                          const charWidth = 8.4; // Average width for sans-serif characters
                          const lineHeight = 24; // Corresponds to leading-relaxed (1.5 * 16px)

                          const lineIdx = Math.max(0, Math.floor(y / lineHeight));
                          const colIdx = Math.max(0, Math.floor(x / charWidth));

                          const textLines = target.value.split('\n');
                          let pos = 0;
                          for (let i = 0; i < Math.min(lineIdx, textLines.length); i++) {
                            pos += textLines[i].length + 1; // +1 for newline character
                          }
                          pos += Math.min(colIdx, textLines[lineIdx]?.length || 0);

                          target.setSelectionRange(pos, pos);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const target = e.target as HTMLTextAreaElement;
                          const text = e.dataTransfer.getData("text/plain");
                          if (text) {
                            const start = target.selectionStart || 0;
                            const end = target.selectionEnd || 0;
                            const newValue = emailBody.substring(0, start) + text + emailBody.substring(end);
                            setEmailBody(newValue);
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="bg-secondary/30 rounded-2xl p-5 border border-border/50 h-full">
                      <Label className="text-sm font-semibold mb-3 block">Available Placeholders</Label>
                      <p className="text-xs text-muted-foreground mb-4">
                        Drag and drop these into your email body or subject line to personalize your message.
                      </p>

                      <div className="flex flex-wrap gap-2 pr-1">
                        <div
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", name);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          className="bg-background border border-border hover:border-primary/50 hover:bg-primary/5 text-foreground px-3 py-1.5 rounded-lg text-xs font-mono cursor-grab active:cursor-grabbing transition-all flex items-center gap-2 group shadow-sm"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                          Batch Name
                        </div>
                        {sheetData?.headers.map(header => (
                          <div
                            key={header}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", `<<${header}>>`);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                            className="bg-background border border-border hover:border-primary/50 hover:bg-primary/5 text-foreground px-3 py-1.5 rounded-lg text-xs font-mono cursor-grab active:cursor-grabbing transition-all flex items-center gap-2 group shadow-sm"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-primary/40 group-hover:bg-primary transition-colors" />
                            {header}
                          </div>
                        ))}

                        {(!sheetData?.headers || sheetData.headers.length === 0) && (
                          <div className="text-xs text-muted-foreground italic p-4 text-center w-full">
                            No headers found in your sheet.
                          </div>
                        )}
                      </div>

                      <div className="mt-6 pt-4 border-t border-border/50">
                        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-2">Pro Tip</p>
                        <p className="text-xs text-muted-foreground">
                          You can also use these placeholders in the <strong>Subject Line</strong>!
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Review */}
            {step === 5 && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-display font-semibold mb-2">Review & Confirm</h2>
                  <p className="text-muted-foreground">You're almost there. Double check your settings before creating this batch.</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="bg-secondary/30 p-5 rounded-2xl border border-border/50">
                    <div className="text-sm text-muted-foreground mb-1">Batch Name</div>
                    <div className="font-semibold text-lg">{name}</div>
                  </div>

                  <div className="bg-secondary/30 p-5 rounded-2xl border border-border/50">
                    <div className="text-sm text-muted-foreground mb-1">Data Source</div>
                    <div className="font-medium flex items-center gap-2"><FileSpreadsheet className="w-4 h-4 text-green-600" /> {sheetName}</div>
                    <div className="text-xs text-muted-foreground mt-2">Emails: {emailColumn} | Names: {nameColumn}</div>
                  </div>

                  <div className="bg-secondary/30 p-5 rounded-2xl border border-border/50">
                    <div className="text-sm text-muted-foreground mb-1">Template</div>
                    {multiTemplateMode ? (
                      <>
                        <div className="font-medium flex items-center gap-2"><Layers className="w-4 h-4 text-orange-500" /> Multi Template</div>
                        <div className="text-xs text-muted-foreground mt-2">
                          Column: <strong>{categoryColumn}</strong> · {Object.keys(categorySlideMap).length} mapped · Template: {templateName}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-medium flex items-center gap-2"><Presentation className="w-4 h-4 text-orange-500" /> {templateName}</div>
                        <div className="text-xs text-muted-foreground mt-2">{Object.keys(columnMap).length} fields mapped</div>
                      </>
                    )}
                  </div>

                  <div className="bg-secondary/30 p-5 rounded-2xl border border-border/50">
                    <div className="text-sm text-muted-foreground mb-1">Email Subject</div>
                    <div className="font-medium italic">"{emailSubject}"</div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        </div>

        <div className="px-6 md:px-8 py-4 bg-secondary/20 border-t flex justify-between items-center">
          <Button variant="outline" onClick={handlePrev} disabled={step === 0 || creating} className="hover-elevate">
            Back
          </Button>

          {step === STEPS.length - 1 ? (
            <Button onClick={submitBatch} disabled={creating} className="bg-primary hover-elevate">
              {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Create Batch
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={isNextDisabled()} className="hover-elevate">
              Next Step <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
