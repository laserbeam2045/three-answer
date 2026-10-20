/**
 * ひと文字リーグの問題の候補を読み込む（サーバー専用）。
 * 問題は外部のクイズのデータから取り出したもので、公開リポジトリには置かない。
 * 本番は Upstash Redis のキー MOJI_POOL_KEY に JSON で置き（scripts/export-moji-pool.mjs で書き込む）、
 * ローカル開発で Redis が無いときは tools/mined/moji/pool.json（git 管理外）を読む。
 */
import fs from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { MojiQuestion } from "../types";

export const MOJI_POOL_KEY = "moji:pool:v1";
/** 読み込んだ候補を使い回す時間（Redis への問い合わせを減らす） */
const CACHE_MS = 10 * 60_000;

let cache: { pool: MojiQuestion[]; at: number } | null = null;

export async function loadMojiPool(): Promise<MojiQuestion[] | undefined> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.pool;
  let pool: MojiQuestion[] | undefined;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  try {
    if (url && token) {
      const raw = await new Redis({ url, token }).get<MojiQuestion[] | string>(MOJI_POOL_KEY);
      pool = typeof raw === "string" ? (JSON.parse(raw) as MojiQuestion[]) : (raw ?? undefined);
    } else {
      const file = path.join(process.cwd(), "tools", "mined", "moji", "pool.json");
      if (fs.existsSync(file)) pool = JSON.parse(fs.readFileSync(file, "utf8")) as MojiQuestion[];
    }
  } catch (e) {
    console.warn("[moji] 問題の候補を読み込めませんでした:", e instanceof Error ? e.message : e);
  }
  if (pool && pool.length > 0) cache = { pool, at: Date.now() };
  return pool;
}
