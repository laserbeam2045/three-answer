import { describe, expect, it } from "vitest";
import {
  effectiveElapsed,
  isExpired,
  newTimer,
  pauseTimer,
  remainingMs,
  revealMsFor,
} from "@/lib/time";
import { resumeTimer } from "@/lib/time";

const NOW = 1_000_000;

describe("newTimer / revealMsFor", () => {
  it("revealMs = 400 + 文字数*100、totalMs = revealMs + answerSeconds*1000", () => {
    const t = newTimer("あいうえお", 45, NOW); // 5文字 -> 900ms
    expect(t.revealMs).toBe(900);
    expect(t.totalMs).toBe(900 + 45_000);
    expect(t.elapsedBeforeResumeMs).toBe(0);
    expect(t.resumedAt).toBe(NOW);
    expect(t.paused).toBe(false);
  });

  it("revealMs は 12000ms が上限", () => {
    expect(revealMsFor("あ".repeat(200))).toBe(12_000);
    expect(newTimer("あ".repeat(500), 30, NOW).totalMs).toBe(12_000 + 30_000);
  });
});

describe("effectiveElapsed", () => {
  const t = newTimer("あいうえお", 45, NOW); // totalMs = 45900

  it("動作中は now - resumedAt が加算される", () => {
    expect(effectiveElapsed(t, NOW)).toBe(0);
    expect(effectiveElapsed(t, NOW + 1234)).toBe(1234);
  });

  it("totalMs でクランプされる", () => {
    expect(effectiveElapsed(t, NOW + t.totalMs + 99_999)).toBe(t.totalMs);
  });

  it("負にはならない", () => {
    expect(effectiveElapsed(t, NOW - 5000)).toBe(0);
  });
});

describe("pause / resume", () => {
  const t = newTimer("あいうえお", 45, NOW);

  it("pause で経過時間が elapsedBeforeResumeMs に固定される", () => {
    const p = pauseTimer(t, NOW + 5000);
    expect(p.paused).toBe(true);
    expect(p.elapsedBeforeResumeMs).toBe(5000);
    // paused 中は時間が進んでも凍結される
    expect(effectiveElapsed(p, NOW + 100_000)).toBe(5000);
  });

  it("pause -> resume で経過が保存され、resume 後に続きから進む", () => {
    const p = pauseTimer(t, NOW + 5000);
    const r = resumeTimer(p, NOW + 60_000);
    expect(r.paused).toBe(false);
    expect(r.resumedAt).toBe(NOW + 60_000);
    expect(r.elapsedBeforeResumeMs).toBe(5000);
    expect(effectiveElapsed(r, NOW + 60_000)).toBe(5000);
    expect(effectiveElapsed(r, NOW + 61_000)).toBe(6000);
  });

  it("二重 pause / 二重 resume は no-op", () => {
    const p = pauseTimer(t, NOW + 5000);
    expect(pauseTimer(p, NOW + 9000)).toBe(p);
    expect(resumeTimer(t, NOW + 9000)).toBe(t);
  });
});

describe("isExpired", () => {
  const t = newTimer("あいうえお", 45, NOW);

  it("totalMs 未満では期限切れしない", () => {
    expect(isExpired(t, NOW)).toBe(false);
    expect(isExpired(t, NOW + t.totalMs - 1)).toBe(false);
  });

  it("totalMs 以上で期限切れ", () => {
    expect(isExpired(t, NOW + t.totalMs)).toBe(true);
    expect(isExpired(t, NOW + t.totalMs + 10_000)).toBe(true);
  });

  it("paused では時間がいくら進んでも期限切れしない", () => {
    const p = pauseTimer(t, NOW + 5000);
    expect(isExpired(p, NOW + t.totalMs + 100_000)).toBe(false);
  });
});

describe("remainingMs", () => {
  const t = newTimer("あいうえお", 45, NOW);

  it("totalMs - 経過時間を返す", () => {
    expect(remainingMs(t, NOW)).toBe(t.totalMs);
    expect(remainingMs(t, NOW + 1000)).toBe(t.totalMs - 1000);
  });

  it("0 未満にはならない", () => {
    expect(remainingMs(t, NOW + t.totalMs + 500)).toBe(0);
  });

  it("paused 中は残り時間が凍結される", () => {
    const p = pauseTimer(t, NOW + 5000);
    expect(remainingMs(p, NOW + 999_999)).toBe(t.totalMs - 5000);
  });
});
