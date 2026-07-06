import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getColumnName(index: number): string {
  let columnName = "";
  let temp = index;
  while (temp >= 0) {
    columnName = String.fromCharCode((temp % 26) + 65) + columnName;
    temp = Math.floor(temp / 26) - 1;
  }
  return columnName;
}
