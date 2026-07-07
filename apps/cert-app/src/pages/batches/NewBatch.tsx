import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useApproval } from "@/hooks/use-approval";
import { useLockedFeatureGuard } from "@/components/LockedFeature";
import {
  useGetSheetData,
  useGetSlidePlaceholders,
  useCreateBatch,
  getListBatchesQueryKey,
  customFetch,
  useListBuiltinTemplates,
  useGetBuiltinTemplate,
  useGetSpreadsheet,
} from "@workspace/api-client-react";
import { useGooglePicker } from "@/hooks/use-google-picker";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { supabase } from "@/lib/supabase";

import { StepName } from "./steps/StepName";
import { StepDataSource } from "./steps/StepDataSource";
import { StepTemplate } from "./steps/StepTemplate";
import { StepMapData } from "./steps/StepMapData";
import { StepEmailSettings } from "./steps/StepEmailSettings";
import { StepReview } from "./steps/StepReview";

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

  const [name, setName] = useState("");

  const [sheetId, setSheetId] = useState("");
  const [sheetName, setSheetName] = useState("");
  const [tabName, setTabName] = useState("");
  const [dataSourceKind, setDataSourceKind] = useState<"google" | "inbuilt">("inbuilt");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [spreadsheetName, setSpreadsheetName] = useState("");

  const { recheckGoogleAuth, googleAuthStatus, connectGoogle } = useAuth();
  const hasGoogleAuth = googleAuthStatus.sheets;
  const { isApproved } = useApproval();
  const slidesGuard = useLockedFeatureGuard("Google Slides templates", "google_slides_templates");

  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateKind, setTemplateKind] = useState<"slides" | "builtin">("builtin");

  useEffect(() => {
    if (!isApproved && templateKind === "slides") {
      setTemplateKind("builtin");
      setTemplateId("");
      setTemplateName("");
    }
  }, [isApproved, templateKind]);

  const [multiTemplateMode, setMultiTemplateMode] = useState(false);
  const [categoryColumn, setCategoryColumn] = useState("");
  const [categorySlideMap, setCategorySlideMap] = useState<Record<string, number>>({});
  const [defaultSlideIndex, setDefaultSlideIndex] = useState<number>(0);

  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [emailColumn, setEmailColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");


  const [emailSubject, setEmailSubject] = useState("Your Certificate is ready!");
  const [emailBody, setEmailBody] = useState("Hi ,\n\nHere is your certificate attached.\n\nBest,\nThe Team");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session?.access_token) return;
    });
  }, []);

  const { openPicker } = useGooglePicker();
  const [pickerLoading, setPickerLoading] = useState<"sheet" | "presentation" | null>(null);

  const handlePickSheet = async () => {
    setPickerLoading("sheet");
    try {
      const picked = await openPicker("sheet");
      if (picked) { setSheetId(picked.id); setSheetName(picked.name); }
    } finally {
      setPickerLoading(null);
    }
  };

  const handlePickTemplate = async () => {
    setPickerLoading("presentation");
    try {
      const picked = await openPicker("presentation");
      if (picked) { setTemplateId(picked.id); setTemplateName(picked.name); setCategorySlideMap({}); }
    } finally {
      setPickerLoading(null);
    }
  };

  const { data: sheetData, isLoading: sheetDataLoading } = useGetSheetData(sheetId, { tabName }, { query: { enabled: dataSourceKind === "google" && !!sheetId } as any });
  const { data: inbuiltSheetData, isLoading: inbuiltSheetLoading } = useGetSpreadsheet(spreadsheetId, {
    query: { enabled: dataSourceKind === "inbuilt" && !!spreadsheetId } as any,
  });

  const inbuiltSheet = inbuiltSheetData as any;

  // Treat row 0 of the inbuilt spreadsheet as the header row (same as how the API processes it)
  const inbuiltRawCols: string[] = inbuiltSheet?.columns ?? [];
  const inbuiltFirstRow: Record<string, string> = inbuiltSheet?.rows?.[0] ?? {};
  const inbuiltHeaders: string[] = inbuiltRawCols
    .map((col: string) => inbuiltFirstRow[col]?.trim())
    .filter(Boolean) as string[];
  // Data rows for category detection start at index 1
  const inbuiltDataRows: Record<string, string>[] = (inbuiltSheet?.rows ?? []).slice(1).map((row: Record<string, string>) => {
    const mapped: Record<string, string> = {};
    inbuiltRawCols.forEach((col: string, i: number) => {
      if (inbuiltHeaders[i]) mapped[inbuiltHeaders[i]] = row[col] ?? "";
    });
    return mapped;
  });

  const sheetHeaders: string[] =
    dataSourceKind === "inbuilt"
      ? inbuiltHeaders.length > 0 ? inbuiltHeaders : inbuiltRawCols
      : sheetData?.headers ?? [];

  const resolvedSheetDataLoading = dataSourceKind === "inbuilt" ? inbuiltSheetLoading : sheetDataLoading;

  const uniqueCategories = (() => {
    if (!categoryColumn) return [] as string[];
    const rows: Record<string, string>[] =
      dataSourceKind === "inbuilt"
        ? inbuiltDataRows
        : (sheetData?.rows as Record<string, string>[]) ?? [];
    if (!rows.length) return [] as string[];
    const values = rows.map(r => r[categoryColumn]).filter(Boolean);
    return [...new Set(values)] as string[];
  })();

  const { data: builtinTemplatesRes, isLoading: builtinTemplatesLoading } = useListBuiltinTemplates();
  const builtinTemplates = (builtinTemplatesRes as any)?.templates ?? [];

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
      ? builtinDetailRes ? { placeholders: (builtinDetailRes as any).placeholders } : undefined
      : slidesPlaceholdersRes;
  const placeholdersLoading = templateKind === "builtin" ? builtinDetailLoading : slidesPlaceholdersLoading;
  const placeholders = placeholdersRes?.placeholders ?? [];

  const { data: slidesInfoRes, isLoading: slidesInfoLoading } = useQuery({
    queryKey: [`/api/slides/${templateId}/slides-info`],
    queryFn: () => customFetch<{ slides: Array<{ index: number; objectId: string; thumbnailUrl: string | null }> }>(`/api/slides/${templateId}/slides-info`, { method: "GET" }),
    enabled: !!templateId && multiTemplateMode,
  });
  const slidesInfo = slidesInfoRes?.slides ?? [];

  const { mutateAsync: createBatchAsync, isPending: creating } = useCreateBatch();

  const handleNext = () => setStep(s => Math.min(STEPS.length - 1, s + 1));
  const handlePrev = () => setStep(s => Math.max(0, s - 1));

  const submitBatch = async () => {
    const finalSlideMap: Record<string, number> = { ...categorySlideMap };
    if (multiTemplateMode) finalSlideMap["_default"] = defaultSlideIndex;

    try {
      const batch = await createBatchAsync({
        data: {
          name,
          sheetId: dataSourceKind === "google" ? sheetId : undefined,
          sheetName: dataSourceKind === "google" ? sheetName : undefined,
          tabName: dataSourceKind === "google" ? tabName : undefined,
          spreadsheetId: dataSourceKind === "inbuilt" ? spreadsheetId : undefined,
          dataSourceKind,
          templateId,
          templateName,
          templateKind,
          columnMap,
          emailColumn,
          nameColumn,
          emailSubject,
          emailBody,
          ...(multiTemplateMode && categoryColumn ? { categoryColumn, categorySlideMap: finalSlideMap } : {}),
        } as any,
      });

      queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() });

      toast({ title: "Batch created!" });
      setLocation(`/batches/${batch.id}`);
    } catch (error: any) {
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
  };

  const isNextDisabled = () => {
    if (step === 0) return !name;
    if (step === 1) return dataSourceKind === "inbuilt" ? !spreadsheetId : !sheetId;
    if (step === 2) {
      if (!templateId) return true;
      if (multiTemplateMode && !categoryColumn) return true;
      if (multiTemplateMode && categoryColumn && uniqueCategories.length > 0) {
        return !uniqueCategories.every(cat => cat in categorySlideMap);
      }
      return false;
    }
    if (step === 3) return !emailColumn || !nameColumn || Object.keys(columnMap).length < placeholders.length;
    return false;
  };

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-1 sm:py-1 pb-6 flex flex-col h-[calc(100dvh-7rem)]">
      {/* Stepper Header */}
      <div className="mb-2 sm:mb-4 shrink-0">
        <h1 className="text-2xl sm:text-3xl font-display font-bold mb-1 sm:mb-2">Create New Batch</h1>
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-secondary rounded-full -z-10" />
          <div
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-all duration-500 ease-out -z-10"
            style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
          />
          {STEPS.map((label, idx) => (
            <div key={idx} className="flex flex-col items-center gap-1 sm:gap-2">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-sm flex items-center justify-center text-xs sm:text-sm font-semibold transition-colors duration-300 ${
                step > idx ? "bg-primary text-primary-foreground" :
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

      {/* Main Content */}
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
              {step === 0 && (
                <StepName
                  name={name}
                  onNameChange={setName}
                />
              )}
              {step === 1 && (
                <StepDataSource
                  hasGoogleAuth={hasGoogleAuth}
                  connectGoogle={connectGoogle}
                  sheetId={sheetId}
                  sheetName={sheetName}
                  pickerLoading={pickerLoading}
                  onPickSheet={handlePickSheet}
                  dataSourceKind={dataSourceKind}
                  onDataSourceKindChange={setDataSourceKind}
                  spreadsheetId={spreadsheetId}
                  spreadsheetName={spreadsheetName}
                  onPickSpreadsheet={(id, sname) => { setSpreadsheetId(id); setSpreadsheetName(sname); }}
                />
              )}
              {step === 2 && (
                <StepTemplate
                  templateKind={templateKind}
                  templateId={templateId}
                  templateName={templateName}
                  multiTemplateMode={multiTemplateMode}
                  categoryColumn={categoryColumn}
                  categorySlideMap={categorySlideMap}
                  defaultSlideIndex={defaultSlideIndex}
                  pickerLoading={pickerLoading}
                  slidesGuard={slidesGuard}
                  builtinTemplatesLoading={builtinTemplatesLoading}
                  builtinTemplates={builtinTemplates}
                  slidesInfoLoading={slidesInfoLoading}
                  slidesInfo={slidesInfo}
                  uniqueCategories={uniqueCategories}
                  sheetHeaders={sheetHeaders}
                  onTemplateKindChange={setTemplateKind}
                  onMultiTemplateModeChange={setMultiTemplateMode}
                  onTemplateSelect={(id, tname) => { setTemplateId(id); setTemplateName(tname); }}
                  onPickTemplate={handlePickTemplate}
                  onCategoryColumnChange={setCategoryColumn}
                  onCategorySlideMapChange={setCategorySlideMap}
                  onDefaultSlideIndexChange={setDefaultSlideIndex}
                />
              )}
              {step === 3 && (
                <StepMapData
                  sheetDataLoading={resolvedSheetDataLoading}
                  placeholdersLoading={placeholdersLoading}
                  sheetHeaders={sheetHeaders}
                  placeholders={placeholders}
                  nameColumn={nameColumn}
                  onNameColumnChange={setNameColumn}
                  emailColumn={emailColumn}
                  onEmailColumnChange={setEmailColumn}
                  columnMap={columnMap}
                  onColumnMapChange={setColumnMap}
                />
              )}
              {step === 4 && (
                <StepEmailSettings
                  emailSubject={emailSubject}
                  onSubjectChange={setEmailSubject}
                  emailBody={emailBody}
                  onBodyChange={setEmailBody}
                  batchName={name}
                  sheetHeaders={sheetHeaders}
                />
              )}
              {step === 5 && (
                <StepReview
                  name={name}
                  sheetName={sheetName}
                  emailColumn={emailColumn}
                  nameColumn={nameColumn}
                  templateName={templateName}
                  multiTemplateMode={multiTemplateMode}
                  categoryColumn={categoryColumn}
                  categorySlideMap={categorySlideMap}
                  columnMap={columnMap}
                  emailSubject={emailSubject}
                />
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
