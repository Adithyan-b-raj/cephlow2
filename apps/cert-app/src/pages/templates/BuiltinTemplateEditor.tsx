import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetBuiltinTemplate,
  useCreateBuiltinTemplate,
  useUpdateBuiltinTemplate,
  uploadAssetToR2,
  getListBuiltinTemplatesQueryKey,
} from "@workspace/api-client-react";
import { TemplateEditor } from "@/components/template-editor/TemplateEditor";
import { renderThumbnail } from "@/components/template-editor/thumbnail";
import { emptyDocument, type CanvasDocument } from "@/components/template-editor/types";
import { useToast } from "@/hooks/use-toast";
import { useApproval } from "@/hooks/use-approval";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

export default function BuiltinTemplateEditorPage() {
  const [, params] = useRoute<{ id: string }>("/templates/builtin/:id");
  const isNew = !params || params.id === "new";
  const id = isNew ? "" : params!.id;

  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: existing, isLoading } = useGetBuiltinTemplate(id, {
    query: { enabled: !isNew && !!id },
  } as any);

  const [docState, setDocState] = useState<CanvasDocument | null>(null);
  const [name, setName] = useState("");
  const [pendingSave, setPendingSave] = useState<{ name: string; canvas: CanvasDocument; asCopy?: boolean } | null>(null);
  const { isApproved } = useApproval();

  useEffect(() => {
    if (isNew && !docState) {
      setDocState(emptyDocument("a4_landscape"));
      setName("");
    }
  }, [isNew, docState]);

  useEffect(() => {
    if (existing && !docState) {
      setDocState(existing.canvas as CanvasDocument);
      setName(existing.name);
    }
  }, [existing, docState]);

  const { mutate: createTpl, isPending: creating } = useCreateBuiltinTemplate({
    mutation: {
      onSuccess: (data: { id: string }) => {
        qc.invalidateQueries({ queryKey: getListBuiltinTemplatesQueryKey() });
        toast({ title: "Template saved" });
        setLocation(`/templates/builtin/${data.id}`);
      },
      onError: (err: any) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
    },
  });
  const { mutate: updateTpl, isPending: updating } = useUpdateBuiltinTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBuiltinTemplatesQueryKey() });
        toast({ title: "Template saved" });
      },
      onError: (err: any) => toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
    },
  });

  // `creating || updating` only flips to true once the mutation actually
  // starts, but doSave does an async thumbnail render + upload first. Without
  // this ref, repeated clicks during that window each kick off their own
  // create/update, producing duplicate templates.
  const isSavingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const saving = creating || updating || isSaving;

  const doSave = async (n: string, canvas: CanvasDocument) => {
    setName(n);
    setDocState(canvas);
    let thumbnailUrl: string | null = null;
    try {
      const blob = await renderThumbnail(canvas, 800);
      const file = new File([blob], `${n.replace(/[^a-z0-9]/gi, "_") || "template"}_thumb.png`, {
        type: "image/png",
      });
      thumbnailUrl = await uploadAssetToR2(file, file.name, "thumbnail");
    } catch (err) {
      console.warn("[TPL] thumbnail upload failed:", err);
    }

    if (isNew) {
      createTpl({ data: { name: n, canvas, thumbnailUrl } });
    } else {
      updateTpl({ id, data: { name: n, canvas, thumbnailUrl } });
    }
  };

  const doSaveAsCopy = async (n: string, canvas: CanvasDocument) => {
    setName(n);
    setDocState(canvas);
    let thumbnailUrl: string | null = null;
    try {
      const blob = await renderThumbnail(canvas, 800);
      const file = new File([blob], `${n.replace(/[^a-z0-9]/gi, "_") || "template"}_thumb.png`, {
        type: "image/png",
      });
      thumbnailUrl = await uploadAssetToR2(file, file.name, "thumbnail");
    } catch (err) {
      console.warn("[TPL] thumbnail upload failed:", err);
    }
    createTpl({ data: { name: n, canvas, thumbnailUrl } });
  };

  const handleSave = async ({ name: n, canvas }: { name: string; canvas: CanvasDocument }) => {
    if (!n || isSavingRef.current) return;
    const hasQr = canvas.elements?.some((el: any) => el.type === "qr");
    if (isApproved && !hasQr) {
      setPendingSave({ name: n, canvas, asCopy: false });
      return;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await doSave(n, canvas);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const handleSaveAsCopy = async ({ name: n, canvas }: { name: string; canvas: CanvasDocument }) => {
    if (!n || isSavingRef.current) return;
    const hasQr = canvas.elements?.some((el: any) => el.type === "qr");
    if (isApproved && !hasQr) {
      setPendingSave({ name: n, canvas, asCopy: true });
      return;
    }
    isSavingRef.current = true;
    setIsSaving(true);
    try {
      await doSaveAsCopy(n, canvas);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  };

  if (!isNew && isLoading && !docState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!docState) return null;

  return (
    <>
      <TemplateEditor
        initialDoc={docState}
        initialName={name}
        saving={saving}
        onSave={handleSave}
        onSaveAsCopy={isNew ? undefined : handleSaveAsCopy}
        onBack={() => setLocation("/templates")}
      />

      <AlertDialog open={!!pendingSave} onOpenChange={(o) => { if (!o) setPendingSave(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No QR Code Added</AlertDialogTitle>
            <AlertDialogDescription>
              This template doesn't have a QR code element. Recipients won't be able to verify their certificates by scanning. It's strongly recommended to add a QR code before saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSave(null)}>Go Back & Add QR</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (pendingSave) {
                  isSavingRef.current = true;
                  setIsSaving(true);
                  try {
                    if (pendingSave.asCopy) {
                      await doSaveAsCopy(pendingSave.name, pendingSave.canvas);
                    } else {
                      await doSave(pendingSave.name, pendingSave.canvas);
                    }
                  } finally {
                    isSavingRef.current = false;
                    setIsSaving(false);
                  }
                }
                setPendingSave(null);
              }}
            >
              Save Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
