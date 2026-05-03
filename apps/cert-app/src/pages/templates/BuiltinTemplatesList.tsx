import { useLocation } from "wouter";
import {
  useListBuiltinTemplates,
  useDeleteBuiltinTemplate,
  getListBuiltinTemplatesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Pencil, Sparkles, Loader2, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function BuiltinTemplatesListPage() {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useListBuiltinTemplates();
  const { mutate: del, isPending: deleting } = useDeleteBuiltinTemplate({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListBuiltinTemplatesQueryKey() });
        toast({ title: "Template deleted" });
      },
      onError: (err: any) => toast({ title: "Failed to delete", description: err.message, variant: "destructive" }),
    },
  });

  const templates = data?.templates ?? [];

  return (
    <div className="max-w-5xl mx-auto py-6 sm:py-8 px-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold mb-1">My Templates</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Templates designed inside Cephloe.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto" onClick={() => setLocation("/templates/new")}>
            From Google Slides
          </Button>
          <Button className="w-full sm:w-auto" onClick={() => setLocation("/templates/builtin/new")}>
            <Plus className="w-4 h-4 mr-1.5" /> New Builtin Template
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : templates.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 flex flex-col items-center text-center gap-3">
            <div className="bg-primary/10 text-primary p-4 rounded-2xl">
              <Sparkles className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold">No builtin templates yet</h3>
            <p className="text-muted-foreground max-w-sm">
              Design certificates with text, images, shapes and QR codes — all without leaving Cephloe.
            </p>
            <Button onClick={() => setLocation("/templates/builtin/new")} className="mt-2">
              <Plus className="w-4 h-4 mr-1.5" /> Create your first template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t: { id: string; name: string; placeholders: string[]; thumbnailUrl: string | null }) => (
            <Card key={t.id} className="group overflow-hidden hover:shadow-md transition-shadow">
              <div
                className="aspect-[4/3] bg-secondary flex items-center justify-center cursor-pointer"
                onClick={() => setLocation(`/templates/builtin/${t.id}`)}
              >
                {t.thumbnailUrl ? (
                  <img src={t.thumbnailUrl} alt={t.name} className="w-full h-full object-contain" />
                ) : (
                  <Layers className="w-10 h-10 text-muted-foreground/50" />
                )}
              </div>
              <CardContent className="p-3 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.placeholders.length} placeholder{t.placeholders.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => setLocation(`/templates/builtin/${t.id}`)} title="Edit">
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  disabled={deleting}
                  onClick={() => {
                    if (confirm(`Delete "${t.name}"?`)) del({ id: t.id });
                  }}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
