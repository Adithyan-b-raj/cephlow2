import { useState, useCallback, useRef } from "react";
import {
  clientGenerate,
  type GenerationProgress,
  type ClientGenerateResult,
} from "@/lib/clientGenerate";
import { supabase } from "@/lib/supabase";

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

/** Notify the server that generation has ended (cancelled or errored) so
 *  the batch status is never left stuck at "generating". */
async function notifyBatchAborted(
  apiBaseUrl: string,
  batchId: string,
  generated: number,
  failed: number
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    const wsId = localStorage.getItem("cephlow_active_workspace");
    if (wsId) headers["x-workspace-id"] = wsId;
    await fetch(`${apiBaseUrl}/api/batches/${batchId}/client-complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ generated, failed, cancelled: true }),
      // keepalive so it survives even if the tab is navigating away
      keepalive: true,
    });
  } catch {
    // best-effort — ignore network errors during cleanup
  }
}

export function useClientGenerate(): UseClientGenerateReturn {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Track live counts so cancel() can report them accurately
  const progressRef = useRef<GenerationProgress | null>(null);
  const batchIdRef = useRef<string>("");
  const apiBaseUrlRef = useRef<string>("");

  const generate = useCallback(
    async (
      batchId: string,
      selectedCertIds?: string[]
    ): Promise<ClientGenerateResult> => {
      setIsGenerating(true);
      setError(null);
      setProgress(null);
      progressRef.current = null;
      batchIdRef.current = batchId;

      const abortController = new AbortController();
      abortRef.current = abortController;

      const apiBaseUrl = (
        import.meta.env.VITE_API_URL || ""
      ).replace(/\/$/, "");
      apiBaseUrlRef.current = apiBaseUrl;

      try {
        const result = await clientGenerate({
          apiBaseUrl,
          batchId,
          selectedCertIds,
          onProgress: (p) => {
            setProgress({ ...p });
            progressRef.current = p;
          },
          abortSignal: abortController.signal,
        });

        return result;
      } catch (err: any) {
        const msg = err.message || "Generation failed";
        const isCancelled = err.message === "Generation cancelled";

        setError(isCancelled ? null : msg);

        if (isCancelled) {
          // Clear the progress card — the toast in the UI handles feedback
          setProgress(null);
        } else {
          setProgress((prev) =>
            prev
              ? { ...prev, phase: "error", message: msg }
              : { phase: "error", current: 0, total: 0, currentCertName: "", message: msg }
          );
        }

        // ── KEY FIX ──────────────────────────────────────────────────────────
        // Always tell the server generation has ended so the batch is never
        // left permanently stuck at status = "generating".
        const lastProgress = progressRef.current;
        const generated = lastProgress?.current ?? 0;
        await notifyBatchAborted(apiBaseUrl, batchId, generated, 0);
        // ─────────────────────────────────────────────────────────────────────

        throw err;
      } finally {
        setIsGenerating(false);
        abortRef.current = null;
        progressRef.current = null;
      }
    },
    []
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { generate, cancel, isGenerating, progress, error };
}
