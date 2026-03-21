import { useMutation } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export interface SendBatchWhatsappRequest {
  var1Template: string;
  var2Template: string;
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
  return customFetch<SendBatchWhatsappResponse>(
    `/api/batches/${batchId}/send-whatsapp`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
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
