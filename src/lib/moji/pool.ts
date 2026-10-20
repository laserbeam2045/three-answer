/**
 * ひと文字リーグの問題の候補を読み込む（サーバー専用）。
 * 問題は外部のクイズのデータから取り出したもので、公開リポジトリには置かない。
 * 本番は Upstash Redis に、読みの文字数と正答率の10%きざみの区切りごとに分けて JSON で置く
 * （キー `moji:pool:v2:<文字数>:<区切り>`、scripts/export-moji-pool.mjs で書き込む）。
 * 必要な文字数・区切りの分だけ読むので、全部（約2万問）を毎回読まずに済む。
 * ローカル開発で Redis が無いときは tools/mined/moji/pool.json（git 管理外）を読む。
 */
import fs from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import type { MojiQuestion } from "../types";
import { readingChars } from "./kana";
import { mojiRateBucket } from "./engine";

export const mojiPoolKey = (length: number, bucket: number) => `moji:pool:v2:${length}:${bucket}`;
/** 読み込んだ候補を使い回す時間（Redis への問い合わせを減らす） */
const CACHE_MS = 10 * 60_000;

const cache = new Map<string, { pool: MojiQuestion[]; at: number }>();
let localAll: MojiQuestion[] | null = null;

function loadLocal(length: number, bucket: number): MojiQuestion[] {
  if (!localAll) {
    const file = path.join(process.cwd(), "tools", "mined", "moji", "pool.json");
    localAll = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as MojiQuestion[]) : [];
  }
  return localAll.filter((q) => readingChars(q.reading).length === length && mojiRateBucket(q.rate) === bucket);
}

/** 指定した文字数と正答率の区切りの問題をまとめて読む。読めなかったときは undefined */
export async function loadMojiPool(lengths: number[], buckets: number[]): Promise<MojiQuestion[] | undefined> {
  const keys = lengths.flatMap((l) => buckets.map((b) => ({ key: mojiPoolKey(l, b), l, b })));
  const now = Date.now();
  const missing = keys.filter((k) => {
    const c = cache.get(k.key);
    return !c || now - c.at >= CACHE_MS;
  });
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  try {
    if (missing.length > 0) {
      if (url && token) {
        const raws = await new Redis({ url, token }).mget<(MojiQuestion[] | string | null)[]>(...missing.map((k) => k.key));
        missing.forEach((k, i) => {
          const raw = raws[i];
          const pool = typeof raw === "string" ? (JSON.parse(raw) as MojiQuestion[]) : (raw ?? []);
          cache.set(k.key, { pool, at: now });
        });
      } else {
        for (const k of missing) cache.set(k.key, { pool: loadLocal(k.l, k.b), at: now });
      }
    }
  } catch (e) {
    console.warn("[moji] 問題の候補を読み込めませんでした:", e instanceof Error ? e.message : e);
    return undefined;
  }
  return keys.flatMap((k) => cache.get(k.key)?.pool ?? []);
}
