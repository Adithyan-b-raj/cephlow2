import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useLockedFeatureGuard } from "@/components/LockedFeature";
import { useMutation } from "@tanstack/react-query";
import {
  useCreateSlideTemplate,
  useGetSlidePlaceholders,
  useCreateSheet,
  useListSlideTemplates,
  customFetch,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Presentation,
  ExternalLink,
  RefreshCw,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  Tag,
  Sparkles,
  ChevronRight,
  QrCode,
  SkipForward,
  Layers,
  Upload,
  PenTool,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";

const STEPS = [
  "Name Your Template",
  "Edit in Google Slides",
  "Review Placeholders",
  "QR Code",
  "Done",
];

type CreatedFile = { id: string; name: string; url: string };

export default function NewTemplate() {
  const [step, setStep] = useState(0);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const slidesGuard = useLockedFeatureGuard("Google Slides templates");

  const [templateName, setTemplateName] = useState("");
  const [multiTemplate, setMultiTemplate] = useState(false);
  const [sourceMode, setSourceMode] = useState<"new" | "existing" | "upload" | "builtin">("new");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [createdTemplate, setCreatedTemplate] = useState<CreatedFile | null>(null);
  const [createdSheet, setCreatedSheet] = useState<CreatedFile | null>(null);
  const [authToken, setAuthToken] = useState<string>("");
  const [pptxFile, setPptxFile] = useState<File | null>(null);
  const [uploadingPptx, setUploadingPptx] = useState(false);
  const [overridePlaceholders, setOverridePlaceholders] = useState<string[] | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (token) setAuthToken(token);
    });
  }, []);

  const { data: templatesRes, isLoading: templatesLoading } = useListSlideTemplates();

  const extractSlideId = (input: string) => {
    const match = input.match(/\/presentation\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : input.trim();
  };

  const { mutate: createSlide, isPending: creatingSlide } = useCreateSlideTemplate({
    mutation: {
      onSuccess: (data) => {
        setCreatedTemplate(data);
        setStep(1);
        window.open(data.url, "_blank");
      },
      onError: (err: any) => {
        toast({ title: "Failed to create presentation", description: err.message, variant: "destructive" });
      },
    },
  });

  const {
    data: placeholdersRes,
    isLoading: fetchingPlaceholders,
    refetch: refetchPlaceholders,
    isFetched: placeholdersFetched,
  } = useGetSlidePlaceholders(createdTemplate?.id ?? "", {
    query: { enabled: false } as any,
  });

  const placeholders = overridePlaceholders ?? placeholdersRes?.placeholders ?? [];

  const { mutate: createSheet, isPending: creatingSheet } = useCreateSheet({
    mutation: {
      onSuccess: (data) => {
        setCreatedSheet(data);
        setStep(4);
      },
      onError: (err: any) => {
        toast({ title: "Failed to create spreadsheet", description: err.message, variant: "destructive" });
      },
    },
  });

  const handleCreateSlide = () => {
    if (sourceMode === "new") {
      if (!templateName.trim()) return;
      createSlide({ data: { name: templateName.trim() } });
    } else {
      if (!selectedTemplateId) {
        toast({ title: "No template selected", description: "Please choose a slide presentation from the list", variant: "destructive" });
        return;
      }
      createSlide({ data: { existingSlideId: selectedTemplateId } } as any);
    }
  };

  const handleUploadPptx = async () => {
    if (!pptxFile || !templateName.trim()) return;
    setUploadingPptx(true);
    try {
      const buffer = await pptxFile.arrayBuffer();
      const result = await customFetch<CreatedFile>(
        `/api/slides/templates/upload?name=${encodeURIComponent(templateName.trim())}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
          body: buffer,
        }
      );
      setCreatedTemplate(result);
      // Fetch placeholders directly using new ID (react-query state not yet updated)
      const phRes = await customFetch<{ placeholders: string[] }>(
        `/api/slides/${result.id}/placeholders`
      );
      if (phRes.placeholders.length > 0) {
        setOverridePlaceholders(phRes.placeholders);
        setStep(2);
      } else {
        // No placeholders found — let user edit the slide and add them
        setStep(1);
        window.open(result.url, "_blank");
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploadingPptx(false);
    }
  };

  const handleFetchPlaceholders = async () => {
    setOverridePlaceholders(null);
    const result = await refetchPlaceholders();
    if (result.data?.placeholders?.length === 0) {
      toast({
        title: "No placeholders found",
        description: 'Add placeholders like <<Name>> or <<Email>> to your slide and try again.',
      });
      return;
    }
    setStep(2);
  };

  const handleCreateSheet = () => {
    if (!createdTemplate || placeholders.length === 0) return;
    const sheetName = `${createdTemplate.name} – Data`;
    const detectedHeaders = placeholders.map((p) => p.replace(/^<<|>>$/g, ""));
    const requiredHeaders = ["Phone Number", "Email"];
    if (multiTemplate) {
      requiredHeaders.unshift("Role");
    }
    const allHeaders = [...detectedHeaders];
    for (const rh of requiredHeaders) {
      if (!allHeaders.some((h) => h.toLowerCase() === rh.toLowerCase())) {
        allHeaders.push(rh);
      }
    }
    createSheet({ data: { name: sheetName, headers: allHeaders } });
  };

  const { mutate: addQrPlaceholder, isPending: addingQr } = useMutation({
    mutationFn: () =>
      customFetch(`/api/slides/${createdTemplate!.id}/qr-placeholder`, { method: "POST" }),
    onSuccess: () => {
      window.open(createdTemplate!.url, "_blank");
      handleCreateSheet();
    },
    onError: (err: any) => {
      toast({ title: "Failed to add QR placeholder", description: err.message, variant: "destructive" });
    },
  });

  const handleCreateBatch = () => {
    setLocation("/batches/new");
  };

  const slideVariants = {
    enter: { opacity: 0, x: 40 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -40 },
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="mb-10">
        <h1 className="text-3xl font-display font-bold mb-2">Create New Template</h1>
        <p className="text-muted-foreground">
          Build a Slides template with placeholders, then generate a matching spreadsheet automatically.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "bg-primary/15 text-primary ring-2 ring-primary"
                    : "bg-secondary text-muted-foreground"
                }`}
            >
              {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 w-8 rounded-full transition-colors ${i < step ? "bg-primary" : "bg-secondary"
                  }`}
              />
            )}
          </div>
        ))}
        <span className="ml-3 text-sm font-medium text-muted-foreground">{STEPS[step]}</span>
      </div>

      <Card className="overflow-hidden shadow-sm border-border/60">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: "easeInOut" }}
          >
            {/* Step 0 – Name */}
            {step === 0 && (
              <CardContent className="p-8 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 p-3 rounded-2xl">
                    <Presentation className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Template Configuration</CardTitle>
                    <CardDescription>
                      Choose how you want to start your certificate template.
                    </CardDescription>
                  </div>
                </div>

                {/* Source Mode Toggle */}
                <div className="grid grid-cols-2 sm:grid-cols-4 p-1 bg-secondary/50 rounded-xl gap-1">
                  <button
                    onClick={slidesGuard.guard(() => setSourceMode("new"))}
                    className={`py-2 text-sm font-medium rounded-lg transition-all ${
                      sourceMode === "new"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    } ${!slidesGuard.isApproved ? "opacity-50" : ""}`}
                  >
                    Google Slides {!slidesGuard.isApproved && "🔒"}
                  </button>
                  <button
                    onClick={slidesGuard.guard(() => setSourceMode("existing"))}
                    className={`py-2 text-sm font-medium rounded-lg transition-all ${
                      sourceMode === "existing"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    } ${!slidesGuard.isApproved ? "opacity-50" : ""}`}
                  >
                    Use Existing {!slidesGuard.isApproved && "🔒"}
                  </button>
                  <button
                    onClick={slidesGuard.guard(() => setSourceMode("upload"))}
                    className={`py-2 text-sm font-medium rounded-lg transition-all ${
                      sourceMode === "upload"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    } ${!slidesGuard.isApproved ? "opacity-50" : ""}`}
                  >
                    Upload PPTX {!slidesGuard.isApproved && "🔒"}
                  </button>
                  <button
                    onClick={() => setSourceMode("builtin")}
                    className={`py-2 text-sm font-medium rounded-lg transition-all ${
                      sourceMode === "builtin"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Design in App
                  </button>
                </div>

                {/* Mode toggle */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setMultiTemplate(false)}
                    className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 text-left transition-all ${
                      !multiTemplate
                        ? "border-primary bg-primary/5 ring-4 ring-primary/10"
                        : "border-border/50 hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Presentation className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">Single Template</span>
                    </div>
                    <span className="text-xs text-muted-foreground">One slide design for all recipients. Best for simple certificates.</span>
                  </button>
                  <button
                    onClick={() => setMultiTemplate(true)}
                    className={`flex flex-col items-start gap-1.5 p-4 rounded-xl border-2 text-left transition-all ${
                      multiTemplate
                        ? "border-primary bg-primary/5 ring-4 ring-primary/10"
                        : "border-border/50 hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      <span className="text-sm font-semibold">Multi Template</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Multiple slides in one presentation for different roles. Adds a Role column to the sheet.</span>
                  </button>
                </div>

                {sourceMode === "builtin" ? (
                  <div className="space-y-4">
                    <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="bg-primary/15 text-primary p-2 rounded-xl shrink-0">
                          <PenTool className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="font-semibold mb-1">Design certificates inside Cephloe</p>
                          <p className="text-sm text-muted-foreground">
                            A full canvas editor with text, images, shapes, alignment guides,
                            layers and undo/redo. Templates render to PDF entirely in your browser —
                            no Google Slides required.
                          </p>
                        </div>
                      </div>
                      <ul className="text-sm space-y-1 text-muted-foreground pl-1">
                        <li>• Drag, resize, rotate any element</li>
                        <li>• Bundled fonts: Inter, Roboto, Lora, Playfair, Montserrat, Dancing Script</li>
                        <li>• Insert <code className="bg-secondary px-1 rounded">{"<<placeholders>>"}</code>, QR codes, logos</li>
                        <li>• Saved templates appear in the batch wizard</li>
                      </ul>
                    </div>
                    <Button
                      onClick={() => setLocation("/templates/builtin/new")}
                      className="w-full h-11"
                    >
                      <PenTool className="w-4 h-4 mr-2" /> Open Builtin Editor
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setLocation("/templates")}
                      className="w-full h-11"
                    >
                      View My Builtin Templates
                    </Button>
                  </div>
                ) : sourceMode === "new" ? (
                  <div className="space-y-2">
                    <Label htmlFor="template-name">Template name</Label>
                    <Input
                      id="template-name"
                      placeholder="e.g. Completion Certificate 2024"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleCreateSlide()}
                      className="h-11"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use placeholders like{" "}
                      <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground">{"<<Name>>"}</code>,{" "}
                      <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground">{"<<Email>>"}</code>, and{" "}
                      <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground">{"<<Phone Number>>"}</code>{" "}
                      inside the slide.{multiTemplate ? " Add different designs on separate slides — each slide can be mapped to a role during batch creation." : " Phone Number and Email columns are always included in the spreadsheet."}
                    </p>
                  </div>
                ) : sourceMode === "upload" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="upload-name">Template name</Label>
                      <Input
                        id="upload-name"
                        placeholder="e.g. Completion Certificate 2024"
                        value={templateName}
                        onChange={(e) => setTemplateName(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>PPTX file</Label>
                      <label
                        className={`flex flex-col items-center justify-center gap-3 w-full h-32 rounded-xl border-2 border-dashed cursor-pointer transition-all ${
                          pptxFile
                            ? "border-primary bg-primary/5"
                            : "border-border/60 hover:border-primary/40 hover:bg-secondary/40"
                        }`}
                      >
                        <input
                          type="file"
                          accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            setPptxFile(file);
                            if (file && !templateName.trim()) {
                              setTemplateName(file.name.replace(/\.pptx$/i, ""));
                            }
                          }}
                        />
                        {pptxFile ? (
                          <>
                            <Upload className="w-6 h-6 text-primary" />
                            <span className="text-sm font-medium text-foreground text-center px-4 truncate max-w-full">{pptxFile.name}</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-6 h-6 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Click to choose a .pptx file</span>
                          </>
                        )}
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Your PPTX will be converted to Google Slides. Placeholders like{" "}
                      <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground">{"<<Name>>"}</code>{" "}
                      will be detected automatically.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Label>Select an existing Google Slide</Label>
                    {templatesLoading ? (
                      <div className="flex items-center gap-3 text-muted-foreground p-8"><Loader2 className="animate-spin" /> Loading presentations...</div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[350px] overflow-y-auto p-1 pr-2">
                        {templatesRes?.templates.length === 0 ? (
                          <div className="col-span-full py-8 text-center text-muted-foreground bg-secondary/30 rounded-xl border border-dashed">
                            No Google Slides found in your account.
                          </div>
                        ) : (
                          templatesRes?.templates.map((tpl) => (
                            <div
                              key={tpl.id}
                              onClick={() => {
                                setSelectedTemplateId(tpl.id);
                              }}
                              className={`group p-3 rounded-xl border-2 cursor-pointer transition-all hover-elevate flex flex-col gap-3 ${
                                selectedTemplateId === tpl.id
                                  ? "border-primary bg-primary/5 ring-4 ring-primary/10"
                                  : "border-border/50 bg-card hover:border-primary/30"
                              }`}
                            >
                              {tpl.thumbnailUrl ? (
                                <img
                                  src={`${(import.meta.env.VITE_API_URL || "").replace(/\/$/, "")}${tpl.thumbnailUrl}${authToken ? `?token=${authToken}` : ""}`}
                                  alt={tpl.name}
                                  className="w-full aspect-[4/3] object-cover rounded-lg border border-border/50"
                                />
                              ) : (
                                <div className="w-full aspect-[4/3] bg-secondary rounded-lg flex items-center justify-center">
                                  <Presentation className="w-8 h-8 text-muted-foreground/50" />
                                </div>
                              )}
                              <div className="font-semibold text-xs line-clamp-2 px-1">
                                {tpl.name}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      We'll scan the selected slide for placeholders like <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground">{"<<Name>>"}</code> so we can generate your spreadsheet.
                    </p>
                  </div>
                )}

                {sourceMode === "builtin" ? null : sourceMode === "upload" ? (
                  <Button
                    onClick={handleUploadPptx}
                    disabled={uploadingPptx || !pptxFile || !templateName.trim()}
                    className="w-full h-11"
                  >
                    {uploadingPptx ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading & converting…</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" /> Upload & Convert</>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={handleCreateSlide}
                    disabled={creatingSlide || (sourceMode === "new" ? !templateName.trim() : !selectedTemplateId)}
                    className="w-full h-11"
                  >
                    {creatingSlide ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {sourceMode === "new" ? "Creating…" : "Linking…"}</>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        {sourceMode === "new" ? "Create & Open Slide" : "Link & Verify Slide"}
                      </>
                    )}
                  </Button>
                )}
              </CardContent>
            )}

            {/* Step 1 – Edit in Slides */}
            {step === 1 && createdTemplate && (
              <CardContent className="p-8 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 p-3 rounded-2xl">
                    <Tag className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Add your placeholders</CardTitle>
                    <CardDescription>
                      Your presentation is open in a new tab. Add placeholder tags to the slide, then come back here.
                    </CardDescription>
                  </div>
                </div>

                <div className="bg-secondary/50 border border-border/60 rounded-2xl p-5 space-y-3">
                  <p className="text-sm font-semibold text-foreground">{createdTemplate.name}</p>
                  <a
                    href={createdTemplate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open Google Slides
                  </a>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-200">
                  <p className="font-semibold mb-1">How to add placeholders</p>
                  <p>
                    In your slide, type tags surrounded by double angle brackets, for example:
                    <br />
                    <code className="font-mono bg-white/60 dark:bg-black/20 px-1.5 py-0.5 rounded mt-1 inline-block">
                      {"<<Name>>   <<Email>>   <<Phone Number>>   <<Course>>"}
                    </code>
                  </p>
                </div>

                <Button
                  onClick={handleFetchPlaceholders}
                  disabled={fetchingPlaceholders}
                  className="w-full h-11"
                >
                  {fetchingPlaceholders ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Scanning slide…</>
                  ) : (
                    <><RefreshCw className="w-4 h-4 mr-2" /> I've finished editing — fetch placeholders</>
                  )}
                </Button>
              </CardContent>
            )}

            {/* Step 2 – Review placeholders */}
            {step === 2 && (
              <CardContent className="p-8 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-green-100 dark:bg-green-900/30 text-green-600 p-3 rounded-2xl">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Create matching spreadsheet</CardTitle>
                    <CardDescription>
                      These placeholders were found in your slide. They'll become column headers in a new Google Sheet.
                    </CardDescription>
                  </div>
                </div>

                {placeholders.length > 0 ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">
                      {placeholders.length} placeholder{placeholders.length !== 1 ? "s" : ""} found
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {placeholders.map((ph) => (
                        <Badge key={ph} variant="secondary" className="text-sm px-3 py-1 font-mono">
                          {ph}
                        </Badge>
                      ))}
                    </div>
                    <div className="bg-secondary/40 rounded-xl p-4 text-sm text-muted-foreground">
                      A spreadsheet named{" "}
                      <span className="font-semibold text-foreground">
                        "{createdTemplate?.name} – Data"
                      </span>{" "}
                      will be created with these column headers:{" "}
                      <span className="text-foreground font-medium">
                        {(() => {
                          const detected = placeholders.map((p) => p.replace(/^<<|>>$/g, ""));
                          const required = ["Phone Number", "Email"];
                          if (multiTemplate) required.unshift("Role");
                          const all = [...detected];
                          for (const rh of required) {
                            if (!all.some((h) => h.toLowerCase() === rh.toLowerCase())) {
                              all.push(rh);
                            }
                          }
                          return all.join(", ");
                        })()}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    No placeholders detected. Go back and add some.
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1 h-11">
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={placeholders.length === 0}
                    className="flex-1 h-11"
                  >
                    Continue <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            )}

            {/* Step 3 – QR Code */}
            {step === 3 && (
              <CardContent className="p-8 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 p-3 rounded-2xl">
                    <QrCode className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Add a QR code?</CardTitle>
                    <CardDescription>
                      A QR code lets recipients scan and verify their certificate online.
                    </CardDescription>
                  </div>
                </div>

                <div className="grid gap-3">
                  <button
                    onClick={() => addQrPlaceholder()}
                    disabled={addingQr}
                    className="flex items-center gap-4 p-5 rounded-xl border-2 border-purple-200 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all text-left disabled:opacity-60"
                  >
                    <div className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 p-2.5 rounded-xl shrink-0">
                      {addingQr ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Add QR Code</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Places a scannable QR placeholder in the bottom-right of your slide.
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={handleCreateSheet}
                    disabled={creatingSheet || addingQr}
                    className="flex items-center gap-4 p-5 rounded-xl border-2 border-border hover:border-muted-foreground/40 hover:bg-secondary/50 transition-all text-left disabled:opacity-60"
                  >
                    <div className="bg-secondary text-muted-foreground p-2.5 rounded-xl shrink-0">
                      {creatingSheet ? <Loader2 className="w-5 h-5 animate-spin" /> : <SkipForward className="w-5 h-5" />}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">Skip</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Continue without a QR code.
                      </p>
                    </div>
                  </button>
                </div>

                <Button variant="ghost" size="sm" onClick={() => setStep(2)} className="w-full">
                  Back
                </Button>
              </CardContent>
            )}

            {/* Step 4 – Done */}
            {step === 4 && createdTemplate && createdSheet && (
              <CardContent className="p-8 space-y-6">
                <div className="text-center space-y-3 py-2">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">All set!</CardTitle>
                    <CardDescription className="mt-1">
                      Your template and spreadsheet are ready to use.
                    </CardDescription>
                  </div>
                </div>

                <div className="grid gap-3">
                  <a
                    href={createdTemplate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all group"
                  >
                    <div className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 p-2.5 rounded-xl">
                      <Presentation className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground group-hover:text-primary truncate">
                        {createdTemplate.name}
                      </p>
                      <p className="text-xs text-muted-foreground">Google Slides Template</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                  </a>

                  <a
                    href={createdSheet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-4 p-4 rounded-xl border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-all group"
                  >
                    <div className="bg-green-100 dark:bg-green-900/30 text-green-600 p-2.5 rounded-xl">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground group-hover:text-primary truncate">
                        {createdSheet.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Columns: {(() => {
                          const detected = placeholders.map((p) => p.replace(/^<<|>>$/g, ""));
                          const required = ["Phone Number", "Email"];
                          const all = [...detected];
                          for (const rh of required) {
                            if (!all.some((h) => h.toLowerCase() === rh.toLowerCase())) {
                              all.push(rh);
                            }
                          }
                          return all.join(", ");
                        })()}
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                  </a>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep(0);
                      setTemplateName("");
                      setCreatedTemplate(null);
                      setCreatedSheet(null);
                      setPptxFile(null);
                      setOverridePlaceholders(null);
                    }}
                    className="flex-1 h-11"
                  >
                    Create Another
                  </Button>
                  <Button onClick={handleCreateBatch} className="flex-1 h-11">
                    Create a Batch <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            )}
          </motion.div>
        </AnimatePresence>
      </Card>
      {slidesGuard.modal}
    </div>
  );
}
