import { ensureStore } from "./server-store";

export const ensureMemberTables = ensureStore;

export function toMemberErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";

  if (
    message.includes("no such table") ||
    message.includes("no such column") ||
    message.includes("Failed query") ||
    message.includes("D1 binding") ||
    message.includes("cloudflare:")
  ) {
    return "會員資料庫正在準備中，請重新整理後再試。";
  }

  return message;
}
