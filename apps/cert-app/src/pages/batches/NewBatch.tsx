import { useState } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateBatch,
  getListBatchesQueryKey,
  useListBuiltinTemplates,
  useGetBuiltinTemplate,
  useGetSpreadsheet,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [spreadsheetName, setSpreadsheetName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateName, setTemplateName] = useState("");

  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [emailColumn, setEmailColumn] = useState("");
  const [nameColumn, setNameColumn] = useState("");

  const [emailSubject, setEmailSubject] = useState("Your Certificate is ready!");
  const [emailBody, setEmailBody] = useState("Hi ,\n\nHere is your certificate attached.\n\nBest,\nThe Team");

  const { data: inbuiltSpreadsheetRes, isLoading: inbuiltSheetLoading } = useGetSpreadsheet(spreadsheetId, {
    query: { enabled: !!spreadsheetId } as any,
  });

  const inbuiltSheet = inbuiltSpreadsheetRes as any;

  // Treat row 0 of the inbuilt spreadsheet as the header row (same as how the API processes it)
  const inbuiltRawCols: string[] = inbuiltSheet?.columns ?? [];
  const inbuiltFirstRow: Record<string, string> = inbuiltSheet?.rows?.[0] ?? {};
  const inbuiltHeaders: string[] = inbuiltRawCols
    .map((col: string) => inbuiltFirstRow[col]?.trim())
    .filter(Boolean) as string[];

  const sheetHeaders: string[] = inbuiltHeaders.length > 0 ? inbuiltHeaders : inbuiltRawCols;

  const { data: builtinTemplatesRes, isLoading: builtinTemplatesLoading } = useListBuiltinTemplates();
  const builtinTemplates = (builtinTemplatesRes as any)?.templates ?? [];

  const { data: builtinDetailRes, isLoading: builtinDetailLoading } = useGetBuiltinTemplate(
    templateId,
    { query: { enabled: !!templateId } as any },
  );

  const placeholders = builtinDetailRes?.placeholders ?? [];

  const { mutateAsync: createBatchAsync, isPending: creating } = useCreateBatch();

  const handleNext = () => setStep(s => Math.min(STEPS.length - 1, s + 1));
  const handlePrev = () => setStep(s => Math.max(0, s - 1));

  const submitBatch = async () => {
    try {
      const batch = await createBatchAsync({
        data: {
          name,
          spreadsheetId,
          dataSourceKind: "inbuilt",
          templateId,
          templateName,
          templateKind: "builtin",
          columnMap,
          emailColumn,
          nameColumn,
          emailSubject,
          emailBody,
        } as any,
      });

      queryClient.invalidateQueries({ queryKey: getListBatchesQueryKey() });

      toast({ title: "Batch created!" });
      setLocation(`/batches/${batch.id}`);
    } catch (error: any) {
      toast({ title: "Failed to create batch", description: error.message, variant: "destructive" });
    }
  };

  const isNextDisabled = () => {
    if (step === 0) return !name;
    if (step === 1) return !spreadsheetId;
    if (step === 2) return !templateId;
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
                  spreadsheetId={spreadsheetId}
                  spreadsheetName={spreadsheetName}
                  onPickSpreadsheet={(id, sname) => { setSpreadsheetId(id); setSpreadsheetName(sname); }}
                />
              )}
              {step === 2 && (
                <StepTemplate
                  templateId={templateId}
                  builtinTemplatesLoading={builtinTemplatesLoading}
                  builtinTemplates={builtinTemplates}
                  onTemplateSelect={(id, tname) => { setTemplateId(id); setTemplateName(tname); }}
                />
              )}
              {step === 3 && (
                <StepMapData
                  sheetDataLoading={inbuiltSheetLoading}
                  placeholdersLoading={builtinDetailLoading}
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
                  sheetName={spreadsheetName}
                  emailColumn={emailColumn}
                  nameColumn={nameColumn}
                  templateName={templateName}
                  multiTemplateMode={false}
                  categoryColumn=""
                  categorySlideMap={{}}
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
