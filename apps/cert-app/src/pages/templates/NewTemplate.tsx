import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  useCreateSlideTemplate,
  useGetSlidePlaceholders,
  useCreateSheet,
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

const STEPS = [
  "Name Your Template",
  "Edit in Google Slides",
  "Review Placeholders",
  "Done",
];

type CreatedFile = { id: string; name: string; url: string };

export default function NewTemplate() {
  const [step, setStep] = useState(0);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [templateName, setTemplateName] = useState("");
  const [createdTemplate, setCreatedTemplate] = useState<CreatedFile | null>(null);
  const [createdSheet, setCreatedSheet] = useState<CreatedFile | null>(null);

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
    query: { enabled: false },
  });

  const placeholders = placeholdersRes?.placeholders ?? [];

  const { mutate: createSheet, isPending: creatingSheet } = useCreateSheet({
    mutation: {
      onSuccess: (data) => {
        setCreatedSheet(data);
        setStep(3);
      },
      onError: (err: any) => {
        toast({ title: "Failed to create spreadsheet", description: err.message, variant: "destructive" });
      },
    },
  });

  const handleCreateSlide = () => {
    if (!templateName.trim()) return;
    createSlide({ data: { name: templateName.trim() } });
  };

  const handleFetchPlaceholders = async () => {
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
    const headers = placeholders.map((p) => p.replace(/^<<|>>$/g, ""));
    createSheet({ data: { name: sheetName, headers } });
  };

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
              className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                i < step
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
                className={`h-0.5 w-8 rounded-full transition-colors ${
                  i < step ? "bg-primary" : "bg-secondary"
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
                    <CardTitle className="text-xl">Name your template</CardTitle>
                    <CardDescription>
                      We'll create a blank Google Slides presentation for you to edit.
                    </CardDescription>
                  </div>
                </div>

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
                    <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground">{"<<Name>>"}</code>{" "}
                    and{" "}
                    <code className="bg-secondary px-1.5 py-0.5 rounded text-foreground">{"<<Email>>"}</code>{" "}
                    inside the slide to mark fields that will be filled from your spreadsheet.
                  </p>
                </div>

                <Button
                  onClick={handleCreateSlide}
                  disabled={!templateName.trim() || creatingSlide}
                  className="w-full h-11"
                >
                  {creatingSlide ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> Create & Open in Google Slides</>
                  )}
                </Button>
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
                      {"<<Name>>   <<Email>>   <<Course>>"}
                    </code>
                  </p>
                  <p className="mt-2 pt-2 border-t border-amber-200/50 dark:border-amber-800/50 italic text-[11px]">
                    Tip: Add <code className="font-mono font-bold bg-white/40 dark:bg-black/10 px-1 rounded">{"{{qr_code}}"}</code> anywhere on your slide to include a verification link for others to scan.
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
                        {placeholders.map((p) => p.replace(/^<<|>>$/g, "")).join(", ")}
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
                    onClick={handleCreateSheet}
                    disabled={creatingSheet || placeholders.length === 0}
                    className="flex-1 h-11"
                  >
                    {creatingSheet ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Creating…</>
                    ) : (
                      <><FileSpreadsheet className="w-4 h-4 mr-2" /> Create Spreadsheet</>
                    )}
                  </Button>
                </div>
              </CardContent>
            )}

            {/* Step 3 – Done */}
            {step === 3 && createdTemplate && createdSheet && (
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
                        Columns: {placeholders.map((p) => p.replace(/^<<|>>$/g, "")).join(", ")}
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
    </div>
  );
}
