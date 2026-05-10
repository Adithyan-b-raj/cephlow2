import { useMutation, useQuery, UseMutationOptions, MutationFunction } from "@tanstack/react-query";
import { customFetch, ErrorType } from "./custom-fetch";

// Delete Batch
export const deleteBatch = async (batchId: string | number) => {
  return customFetch<{ success: boolean }>(`/api/batches/${batchId}`, {
    method: "DELETE",
  });
};

export const useDeleteBatch = (options?: {
  mutation?: UseMutationOptions<any, ErrorType<unknown>, { batchId: string | number }, unknown>;
}) => {
  const { mutation: mutationOptions } = options ?? {};
  const mutationFn: MutationFunction<any, { batchId: string | number }> = (props) => {
    return deleteBatch(props.batchId);
  };
  return useMutation({ mutationFn, ...mutationOptions });
};

// Smart Generate Batch (with partial selection)
export const generateSmartBatch = async (batchId: string | number, selectedCertIds?: string[]) => {
  return customFetch<any>(`/api/batches/${batchId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ selectedCertIds }),
  });
};

export const useGenerateSmartBatch = (options?: {
  mutation?: UseMutationOptions<any, ErrorType<unknown>, { batchId: string | number; selectedCertIds?: string[] }, unknown>;
}) => {
  const { mutation: mutationOptions } = options ?? {};
  const mutationFn: MutationFunction<any, { batchId: string | number; selectedCertIds?: string[] }> = (props) => {
    return generateSmartBatch(props.batchId, props.selectedCertIds);
  };
  return useMutation({ mutationFn, ...mutationOptions });
};

// Update Batch Configuration
export const updateBatchFields = async (batchId: string | number, data: any) => {
  return customFetch<{ success: boolean; updatedFields: string[] }>(`/api/batches/${batchId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
};

export const useUpdateBatchFields = (options?: {
  mutation?: UseMutationOptions<any, ErrorType<unknown>, { batchId: string | number; data: any }, unknown>;
}) => {
  const { mutation: mutationOptions } = options ?? {};
  const mutationFn: MutationFunction<any, { batchId: string | number; data: any }> = (props) => {
    return updateBatchFields(props.batchId, props.data);
  };
  return useMutation({ mutationFn, ...mutationOptions });
};
