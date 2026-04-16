import { useMutation, UseMutationOptions, MutationFunction } from "@tanstack/react-query";
import { customFetch, ErrorType } from "./custom-fetch";

// Share Folder
export const shareBatchFolder = async (batchId: string | number) => {
  return customFetch<{ success: boolean; shareLink: string }>(
    `/api/batches/${batchId}/share-folder`,
    { method: "POST" }
  );
};

export const useShareBatchFolder = (options?: {
  mutation?: UseMutationOptions<any, ErrorType<unknown>, { batchId: string | number }, unknown>;
}) => {
  const { mutation: mutationOptions } = options ?? {};
  const mutationFn: MutationFunction<any, { batchId: string | number }> = (props) => {
    return shareBatchFolder(props.batchId);
  };
  return useMutation({ mutationFn, ...mutationOptions });
};

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
