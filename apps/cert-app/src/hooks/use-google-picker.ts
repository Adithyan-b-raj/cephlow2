import { useCallback, useRef } from "react";
import { customFetch } from "@workspace/api-client-react";

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

type PickedFile = { id: string; name: string; accessToken: string };

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

const GAPI_URL = "https://apis.google.com/js/api.js";

async function ensurePickerReady(): Promise<void> {
  await loadScript(GAPI_URL);
  await new Promise<void>((resolve) => {
    if (window.gapi?.picker) { resolve(); return; }
    window.gapi.load("picker", resolve);
  });
}

export type PickerMimeType = "sheet" | "presentation";

const MIME: Record<PickerMimeType, string> = {
  sheet: "application/vnd.google-apps.spreadsheet",
  presentation: "application/vnd.google-apps.presentation",
};

const VIEW_ID: Record<PickerMimeType, string> = {
  sheet: "SPREADSHEETS",
  presentation: "PRESENTATIONS",
};

export function useGooglePicker() {
  const pickerRef = useRef<any>(null);

  const openPicker = useCallback(
    async (type: PickerMimeType): Promise<PickedFile | null> => {
      const apiKey = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
      if (!apiKey) {
        console.error("VITE_GOOGLE_API_KEY is not set");
        return null;
      }

      const { accessToken } = await customFetch<{ accessToken: string }>(
        "/api/auth/google/access-token"
      );

      await ensurePickerReady();

      return new Promise((resolve) => {
        const view = new window.google.picker.DocsView(
          window.google.picker.ViewId[VIEW_ID[type]]
        )
          .setMimeTypes(MIME[type])
          .setSelectFolderEnabled(false);

        const picker = new window.google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(accessToken)
          .setDeveloperKey(apiKey)
          .setCallback((data: any) => {
            if (data.action === window.google.picker.Action.PICKED) {
              const doc = data.docs?.[0];
              resolve(doc ? { id: doc.id, name: doc.name, accessToken } : null);
            } else if (data.action === window.google.picker.Action.CANCEL) {
              resolve(null);
            }
          })
          .build();

        pickerRef.current = picker;
        picker.setVisible(true);
      });
    },
    []
  );

  return { openPicker };
}
