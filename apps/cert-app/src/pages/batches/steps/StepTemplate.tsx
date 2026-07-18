import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, PenTool } from "lucide-react";

interface Props {
  templateId: string;
  builtinTemplatesLoading: boolean;
  builtinTemplates: any[];
  onTemplateSelect: (id: string, name: string) => void;
}

export function StepTemplate({
  templateId,
  builtinTemplatesLoading,
  builtinTemplates,
  onTemplateSelect,
}: Props) {
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-3 sm:space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-display font-semibold mb-1 sm:mb-2">Template Setup</h2>
        <p className="text-sm sm:text-base text-muted-foreground">Select a template for your certificates.</p>
      </div>

      {builtinTemplatesLoading ? (
        <div className="flex items-center gap-3 text-muted-foreground p-8">
          <Loader2 className="animate-spin" /> Loading builtin templates...
        </div>
      ) : builtinTemplates.length === 0 ? (
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
            {builtinTemplates.map((tpl) => (
              <div
                key={tpl.id}
                onClick={() => onTemplateSelect(tpl.id, tpl.name)}
                className={`group p-4 rounded-xl border-2 cursor-pointer transition-all hover-elevate flex flex-col gap-4 ${
                  templateId === tpl.id
                    ? "border-primary bg-primary/5 ring-4 ring-primary/10"
                    : "border-border/50 bg-card hover:border-primary/30"
                }`}
              >
                {tpl.thumbnailUrl ? (
                  <img
                    src={tpl.thumbnailUrl}
                    alt={tpl.name}
                    className="w-full aspect-[3/2] sm:aspect-[4/3] object-contain bg-secondary rounded-lg border border-border/50"
                  />
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
      )}
    </div>
  );
}
