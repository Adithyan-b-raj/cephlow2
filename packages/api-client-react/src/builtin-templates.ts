import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { customFetch, type ErrorType } from "./custom-fetch";

export interface BuiltinTemplateSummary {
  id: string;
  name: string;
  placeholders: string[];
  thumbnailUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BuiltinTemplate extends BuiltinTemplateSummary {
  userId: string;
  canvas: any;
}

const KEY_LIST = ["/api/builtin-templates"] as const;
const KEY_ONE = (id: string) => [`/api/builtin-templates/${id}`] as const;

export const getListBuiltinTemplatesQueryKey = () => KEY_LIST;
export const getBuiltinTemplateQueryKey = KEY_ONE;

export const listBuiltinTemplates = () =>
  customFetch<{ templates: BuiltinTemplateSummary[] }>(
    `/api/builtin-templates`,
    { method: "GET" },
  );

export const useListBuiltinTemplates = <
  TData = Awaited<ReturnType<typeof listBuiltinTemplates>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<
    Awaited<ReturnType<typeof listBuiltinTemplates>>,
    TError,
    TData
  >;
}) => {
  return useQuery({
    queryKey: KEY_LIST,
    queryFn: () => listBuiltinTemplates(),
    ...options?.query,
  } as any);
};

export const getBuiltinTemplate = (id: string) =>
  customFetch<BuiltinTemplate>(`/api/builtin-templates/${id}`, { method: "GET" });

export const useGetBuiltinTemplate = (
  id: string,
  options?: { query?: UseQueryOptions<BuiltinTemplate, ErrorType<unknown>, BuiltinTemplate> },
) => {
  return useQuery({
    queryKey: KEY_ONE(id),
    queryFn: () => getBuiltinTemplate(id),
    enabled: !!id,
    ...options?.query,
  } as any);
};

export interface CreateBuiltinTemplateBody {
  name: string;
  canvas: any;
  thumbnailUrl?: string | null;
}

export const createBuiltinTemplate = (data: CreateBuiltinTemplateBody) =>
  customFetch<BuiltinTemplate>(`/api/builtin-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useCreateBuiltinTemplate = (options?: {
  mutation?: UseMutationOptions<
    BuiltinTemplate,
    ErrorType<unknown>,
    { data: CreateBuiltinTemplateBody }
  >;
}) =>
  useMutation({
    mutationFn: ({ data }) => createBuiltinTemplate(data),
    ...options?.mutation,
  });

export interface UpdateBuiltinTemplateBody {
  name?: string;
  canvas?: any;
  thumbnailUrl?: string | null;
}

export const updateBuiltinTemplate = (
  id: string,
  data: UpdateBuiltinTemplateBody,
) =>
  customFetch<BuiltinTemplate>(`/api/builtin-templates/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useUpdateBuiltinTemplate = (options?: {
  mutation?: UseMutationOptions<
    BuiltinTemplate,
    ErrorType<unknown>,
    { id: string; data: UpdateBuiltinTemplateBody }
  >;
}) =>
  useMutation({
    mutationFn: ({ id, data }) => updateBuiltinTemplate(id, data),
    ...options?.mutation,
  });

export const deleteBuiltinTemplate = (id: string) =>
  customFetch<{ success: boolean }>(`/api/builtin-templates/${id}`, {
    method: "DELETE",
  });

export const useDeleteBuiltinTemplate = (options?: {
  mutation?: UseMutationOptions<
    { success: boolean },
    ErrorType<unknown>,
    { id: string }
  >;
}) =>
  useMutation({
    mutationFn: ({ id }) => deleteBuiltinTemplate(id),
    ...options?.mutation,
  });

export interface AssetUploadUrlResponse {
  uploadUrl: string;
  key: string;
  publicUrl: string | null;
}

export const requestAssetUploadUrl = (params: {
  filename: string;
  contentType: string;
  kind?: "image" | "thumbnail";
}) =>
  customFetch<AssetUploadUrlResponse>(`/api/builtin-templates/asset-upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

export async function uploadAssetToR2(
  file: Blob,
  filename: string,
  kind: "image" | "thumbnail" = "image",
): Promise<string> {
  const { uploadUrl, publicUrl } = await requestAssetUploadUrl({
    filename,
    contentType: file.type || "application/octet-stream",
    kind,
  });
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(`R2 upload failed: HTTP ${res.status}`);
  if (!publicUrl) throw new Error("R2_PUBLIC_URL is not configured");
  return publicUrl;
}
