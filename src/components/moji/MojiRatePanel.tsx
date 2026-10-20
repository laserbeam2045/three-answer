"use client";

import OrnateTitle from "@/components/OrnateTitle";
import {
  MOJI_DEFAULT_RATE_MAX,
  MOJI_DEFAULT_RATE_MIN,
  MOJI_GAME_LENGTH,
  MOJI_MAX_PLAYERS,
  MOJI_MIN_PLAYERS,
  MOJI_RATE_STEP,
  mojiRateBuckets,
} from "@/lib/moji/engine";
import stats from "@/lib/moji/stats.json";
import type { UseRoomResult } from "@/hooks/useRoom";

/** 文字数ごと・正答率の10%きざみの区切りごとの問題数（scripts/export-moji-pool.mjs が書く） */
const STATS = stats as Record<string, number[]>;

const PRESETS: { label: string; min: number; max: number }[] = [
  { label: "やさしい", min: 70, max: 100 },
  { label: "ふつう", min: 60, max: 70 },
  { label: "むずかしい", min: 30, max: 60 },
  { label: "超むずかしい", min: 0, max: 30 },
];

const STEPS = Array.from({ length: 100 / MOJI_RATE_STEP + 1 }, (_, i) => i * MOJI_RATE_STEP);

/** 選んだ範囲で、読みが length 文字の問題がいくつあるか */
export function mojiAvailable(length: number, min: number, max: number): number {
  const row = STATS[String(length)] ?? [];
  return mojiRateBuckets(min, max).reduce((sum, b) => sum + (row[b] ?? 0), 0);
}

/** ロビーで、出題する問題の正答率の範囲を選ぶ（ルーム作成者のみ） */
export default function MojiRatePanel({ room }: { room: UseRoomResult }) {
  const { state, send } = room;
  if (!state) return null;
  const isHost = state.you.isHost;
  const min = state.settings.mojiRateMin ?? MOJI_DEFAULT_RATE_MIN;
  const max = state.settings.mojiRateMax ?? MOJI_DEFAULT_RATE_MAX;
  const n = state.moji.players.length;
  const set = (a: number, b: number) => {
    if (!isHost || a >= b) return;
    void send({ type: "setMojiRate", min: a, max: b });
  };
  const lengths = Array.from({ length: MOJI_MAX_PLAYERS - MOJI_MIN_PLAYERS + 1 }, (_, i) => i + MOJI_MIN_PLAYERS);
  const nowCount = n >= MOJI_MIN_PLAYERS ? mojiAvailable(n, min, max) : null;

  return (
    <section className="ornate-2 p-3 sm:p-5">
      <OrnateTitle className="mb-3">問題の難しさ（正答率）</OrnateTitle>
      {!isHost && <p className="text-xs text-muted text-center -mt-2 mb-3">ルーム作成者が選びます</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 mb-3">
        {PRESETS.map((p) => {
          const active = p.min === min && p.max === max;
          return (
            <button
              key={p.label}
              type="button"
              disabled={!isHost}
              onClick={() => set(p.min, p.max)}
              className={`slot px-2 py-2 text-center transition-colors ${active ? "slot-you gold-glow" : isHost ? "opacity-75" : "opacity-50"} ${
                isHost ? "hover:border-gold-3 cursor-pointer" : "cursor-default"
              }`}
            >
              <span className={`block font-display font-extrabold text-sm sm:text-base ${active ? "text-gilt" : "text-ink"}`}>{p.label}</span>
              <span className="block text-[11px] text-muted">
                {p.min}〜{p.max}%
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-2 text-sm">
        <span className="text-muted">正答率</span>
        <select
          value={min}
          disabled={!isHost}
          onChange={(e) => set(Number(e.target.value), max)}
          className="field px-2 py-1.5"
          aria-label="正答率の下限"
        >
          {STEPS.filter((v) => v < 100).map((v) => (
            <option key={v} value={v} disabled={v >= max}>
              {v}%
            </option>
          ))}
        </select>
        <span className="text-muted">〜</span>
        <select
          value={max}
          disabled={!isHost}
          onChange={(e) => set(min, Number(e.target.value))}
          className="field px-2 py-1.5"
          aria-label="正答率の上限"
        >
          {STEPS.filter((v) => v > 0).map((v) => (
            <option key={v} value={v} disabled={v <= min}>
              {v}%
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted text-center mt-2">正答率が高いほどやさしい問題です。</p>

      <div className="mt-3 text-xs text-center">
        {nowCount !== null && (
          <p className={nowCount < MOJI_GAME_LENGTH ? "text-crimson font-bold" : "text-ink"}>
            いまの{n}人だと、この範囲の問題は {nowCount.toLocaleString()}問です
            {nowCount < MOJI_GAME_LENGTH && "（少ないので途中で足りなくなります。範囲を広げてください）"}
          </p>
        )}
        <p className="text-muted mt-1 leading-relaxed">
          {lengths.map((l) => (
            <span key={l} className={`inline-block mx-1 ${l === n ? "text-gold-2 font-bold" : ""}`}>
              {l}人 {mojiAvailable(l, min, max).toLocaleString()}問
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
