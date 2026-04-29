import { useState, useCallback, useRef } from "react";
import {
  clientGenerate,
  type GenerationProgress,
  type ClientGenerateResult,
} from "@/lib/clientGenerate";

export interface UseClientGenerateReturn {
  /** Start client-side generation */
  generate: (batchId: string, selectedCertIds?: string[]) => Promise<ClientGenerateResult>;
  /** Cancel an in-progress generation */
  cancel: () => void;
  /** Whether generation is currently running */
  isGenerating: boolean;
  /** Current progress details */
  progress: GenerationProgress | null;
  /** Last error, if any */
  error: string | null;
}

export function useClientGenerate(): UseClientGenerateReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (
      batchId: string,
      selectedCertIds?: string[]
    ): Promise<ClientGenerateResult> => {
      setIsGenerating(true);
      setError(null);
      setProgress(null);

      const abortController = new AbortController();
      abortRef.current = abortController;

      const apiBaseUrl = (
        import.meta.env.VITE_API_URL || ""
      ).replace(/\/$/, "");

      try {
        const result = await clientGenerate({
          apiBaseUrl,
          batchId,
          selectedCertIds,
          onProgress: (p) => setProgress({ ...p }),
          abortSignal: abortController.signal,
        });

        return result;
      } catch (err: any) {
        const msg = err.message || "Generation failed";
        setError(msg);
        setProgress((prev) =>
          prev
            ? { ...prev, phase: "error", message: msg }
            : {
                phase: "error",
                current: 0,
                total: 0,
                currentCertName: "",
                message: msg,
              }
        );
        throw err;
      } finally {
        setIsGenerating(false);
        abortRef.current = null;
      }
    },
    []
  );

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  return { generate, cancel, isGenerating, progress, error };
}
