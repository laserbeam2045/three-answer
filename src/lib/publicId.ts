import { createHash } from "node:crypto";

/**
 * 参加者の公開 ID。トークンは本人確認に使う秘密の値なので、ほかの人に見せる状態には入れず、
 * 代わりにこの ID を返す（トークンのハッシュの先頭なので、ID からトークンは割り出せない）。
 * サーバーでだけ使う（node:crypto を使うため、クライアントから import しない）
 */
export function publicIdOf(token: string): string {
  return createHash("sha256").update(`three-answer:player:${token}`).digest("hex").slice(0, 16);
}

/** 公開 ID から、候補の中のトークンを探す。見つからなければ null */
export function tokenByPublicId(tokens: readonly string[], id: unknown): string | null {
  if (typeof id !== "string" || !id) return null;
  return tokens.find((t) => publicIdOf(t) === id) ?? null;
}
