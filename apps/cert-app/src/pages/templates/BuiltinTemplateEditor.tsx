import { useEffect, useState } from "react";
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

  const saving = creating || updating;

  const handleSave = async ({ name: n, canvas }: { name: string; canvas: CanvasDocument }) => {
    if (!n) return;
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

  if (!isNew && isLoading && !docState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!docState) return null;

  return (
    <TemplateEditor
      initialDoc={docState}
      initialName={name}
      saving={saving}
      onSave={handleSave}
      onBack={() => setLocation("/templates")}
    />
  );
}
