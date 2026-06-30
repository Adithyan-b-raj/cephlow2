import { useMutation } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

// ─── Individual certificate send ─────────────────────────────────────────────

export interface SendCertEmailRequest {
  emailSubject?: string;
  emailBody?: string;
}

export interface SendCertEmailResponse {
  success: boolean;
  message: string;
}

export const sendCertEmail = async (
  batchId: string,
  certId: string,
  data: SendCertEmailRequest,
): Promise<SendCertEmailResponse> => {
  return customFetch<SendCertEmailResponse>(
    `/api/batches/${batchId}/certificates/${certId}/send`,
    { method: "POST", body: JSON.stringify(data) },
  );
};

export const useSendCertEmail = (options?: {
  mutation?: Parameters<typeof useMutation>[0];
}) => {
  return useMutation<
    SendCertEmailResponse,
    Error,
    { batchId: string; certId: string; data: SendCertEmailRequest }
  >({
    ...(options?.mutation as any),
    mutationFn: ({ batchId, certId, data }) => sendCertEmail(batchId, certId, data),
  });
};

// ─── Lazy open-in-slides ─────────────────────────────────────────────────────

export interface OpenCertSlideResponse {
  slideFileId: string;
  slideUrl: string;
}

export const openCertSlide = async (
  batchId: string,
  certId: string,
): Promise<OpenCertSlideResponse> => {
  return customFetch<OpenCertSlideResponse>(
    `/api/batches/${batchId}/certificates/${certId}/open-slide`,
    { method: "POST" },
  );
};

export const useOpenCertSlide = (options?: {
  mutation?: Parameters<typeof useMutation>[0];
}) => {
  return useMutation<
    OpenCertSlideResponse,
    Error,
    { batchId: string; certId: string }
  >({
    ...(options?.mutation as any),
    mutationFn: ({ batchId, certId }) => openCertSlide(batchId, certId),
  });
};

export interface SendCertWhatsappRequest {
  var1Template: string;
  var2Template: string;
  var3Template?: string;
}

export interface SendCertWhatsappResponse {
  success: boolean;
  message: string;
}

export const sendCertWhatsapp = async (
  batchId: string,
  certId: string,
  data: SendCertWhatsappRequest,
): Promise<SendCertWhatsappResponse> => {
  return customFetch<SendCertWhatsappResponse>(
    `/api/batches/${batchId}/certificates/${certId}/send-whatsapp`,
    { method: "POST", body: JSON.stringify(data) },
  );
};

export const useSendCertWhatsapp = (options?: {
  mutation?: Parameters<typeof useMutation>[0];
}) => {
  return useMutation<
    SendCertWhatsappResponse,
    Error,
    { batchId: string; certId: string; data: SendCertWhatsappRequest }
  >({
    ...(options?.mutation as any),
    mutationFn: ({ batchId, certId, data }) => sendCertWhatsapp(batchId, certId, data),
  });
};

export interface SendBatchWhatsappRequest {
  var1Template: string;
  var2Template: string;
  var3Template?: string;
}

export interface SendBatchWhatsappResponse {
  success: boolean;
  message: string;
  processed: number;
  failed: number;
}

export const sendBatchWhatsapp = async (
  batchId: string,
  data: SendBatchWhatsappRequest,
): Promise<SendBatchWhatsappResponse> => {
  // 1. Fetch certificates for this batch
  const certsResponse = await customFetch<{ certificates: any[] }>(`/api/certificates?batchId=${batchId}`, {
    method: "GET",
  });
  const toSend = (certsResponse.certificates || []).filter(c => c.status === "generated");

  if (toSend.length === 0) {
    return { success: true, message: "No certificates to send", processed: 0, failed: 0 };
  }

  // 2. Start send
  await customFetch(`/api/batches/${batchId}/send-start`, {
    method: "POST",
  });

  let sentCount = 0;
  let failedCount = 0;

  // 3. Process sending with concurrency limit (e.g. 5 parallel sends at a time)
  const CONCURRENCY = 5;
  for (let i = 0; i < toSend.length; i += CONCURRENCY) {
    const chunk = toSend.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (cert) => {
        try {
          await customFetch(`/api/batches/${batchId}/certificates/${cert.id}/send-whatsapp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          sentCount++;
        } catch (err) {
          console.error(`Failed to send WhatsApp to cert ${cert.id}:`, err);
          failedCount++;
        }
      })
    );
  }

  // 4. Complete send
  await customFetch(`/api/batches/${batchId}/send-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sentCount, failedCount }),
  });

  return {
    success: true,
    message: `Finished sending. Sent: ${sentCount}, Failed: ${failedCount}`,
    processed: sentCount,
    failed: failedCount,
  };
};

export const useSendBatchWhatsapp = (options?: {
  mutation?: Parameters<typeof useMutation>[0];
}) => {
  return useMutation<
    SendBatchWhatsappResponse,
    Error,
    { batchId: string; data: SendBatchWhatsappRequest }
  >({
    ...(options?.mutation as any),
    mutationFn: ({ batchId, data }) => sendBatchWhatsapp(batchId, data),
  });
};
