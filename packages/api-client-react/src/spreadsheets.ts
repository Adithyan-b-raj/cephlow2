import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { customFetch, type ErrorType } from "./custom-fetch";

export interface SpreadsheetSummary {
  id: string;
  name: string;
  columns: string[];
  columnCount: number;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Spreadsheet extends SpreadsheetSummary {
  rows: Record<string, string>[];
}

export interface CreateSpreadsheetBody {
  name: string;
  columns: string[];
  rows: Record<string, string>[];
}

export interface UpdateSpreadsheetBody {
  name?: string;
  columns?: string[];
  rows?: Record<string, string>[];
}

const KEY_LIST = ["/api/spreadsheets"] as const;
const KEY_ONE = (id: string) => [`/api/spreadsheets/${id}`] as const;

export const getListSpreadsheetsQueryKey = () => KEY_LIST;
export const getSpreadsheetQueryKey = KEY_ONE;

export const listSpreadsheets = () =>
  customFetch<{ spreadsheets: SpreadsheetSummary[] }>(`/api/spreadsheets`, {
    method: "GET",
  });

export const useListSpreadsheets = <
  TData = Awaited<ReturnType<typeof listSpreadsheets>>,
  TError = ErrorType<unknown>,
>(options?: {
  query?: UseQueryOptions<Awaited<ReturnType<typeof listSpreadsheets>>, TError, TData>;
}) =>
  useQuery<Awaited<ReturnType<typeof listSpreadsheets>>, TError, TData>({
    queryKey: KEY_LIST,
    queryFn: () => listSpreadsheets(),
    ...options?.query,
  } as any);

export const getSpreadsheet = (id: string) =>
  customFetch<Spreadsheet>(`/api/spreadsheets/${id}`, { method: "GET" });

export const useGetSpreadsheet = (
  id: string,
  options?: { query?: UseQueryOptions<Spreadsheet, ErrorType<unknown>, Spreadsheet> },
) =>
  useQuery<Spreadsheet, ErrorType<unknown>, Spreadsheet>({
    queryKey: KEY_ONE(id),
    queryFn: () => getSpreadsheet(id),
    enabled: !!id,
    ...options?.query,
  } as any);

export const createSpreadsheet = (data: CreateSpreadsheetBody) =>
  customFetch<Spreadsheet>(`/api/spreadsheets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useCreateSpreadsheet = (options?: {
  mutation?: UseMutationOptions<
    Spreadsheet,
    ErrorType<unknown>,
    { data: CreateSpreadsheetBody }
  >;
}) =>
  useMutation({
    mutationFn: ({ data }) => createSpreadsheet(data),
    ...options?.mutation,
  });

export const updateSpreadsheet = (id: string, data: UpdateSpreadsheetBody) =>
  customFetch<Spreadsheet>(`/api/spreadsheets/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

export const useUpdateSpreadsheet = (options?: {
  mutation?: UseMutationOptions<
    Spreadsheet,
    ErrorType<unknown>,
    { id: string; data: UpdateSpreadsheetBody }
  >;
}) =>
  useMutation({
    mutationFn: ({ id, data }) => updateSpreadsheet(id, data),
    ...options?.mutation,
  });

export const deleteSpreadsheet = (id: string) =>
  customFetch<{ success: boolean }>(`/api/spreadsheets/${id}`, {
    method: "DELETE",
  });

export const useDeleteSpreadsheet = (options?: {
  mutation?: UseMutationOptions<
    { success: boolean },
    ErrorType<unknown>,
    { id: string }
  >;
}) =>
  useMutation({
    mutationFn: ({ id }) => deleteSpreadsheet(id),
    ...options?.mutation,
  });
