"use client";

import { useEffect, useRef, useState } from "react";
import MojiPlayersPanel from "@/components/moji/MojiPlayersPanel";
import { useTimer } from "@/hooks/useTimer";
import Typewriter from "@/components/Typewriter";
import type { UseRoomResult } from "@/hooks/useRoom";

/** 残りこの秒数からカウントダウンを大きく出す */
const COUNTDOWN_SEC = 5;

/**
 * ひと文字リーグの出題画面。参加者が1人1文字ずつ、自分の担当の文字を書いて「決定」する。
 * ほかの人が書いた文字は判定まで見えない（入力したか・決定したかだけ見える）。
 */
export default function MojiQuestionView({ room }: { room: UseRoomResult }) {
  const { state, send, nowServer } = room;
  const timer = useTimer(state?.timer ?? null, nowServer);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const round = state?.moji.round ?? null;
  const qIndex = state?.qIndex ?? 0;

  useEffect(() => setText(""), [qIndex]);
  const canInput = !!round && round.myPosition !== null && !timer.inReveal && !round.waiting && !round.myLocked;
  useEffect(() => {
    if (canInput) inputRef.current?.focus();
  }, [canInput]);

  if (!state || !state.question || !round || !state.timer) return null;

  const { question } = state;
  const answerTotalMs = Math.max(1, state.timer.totalMs - state.timer.revealMs);
  const ratio = Math.max(0, Math.min(1, timer.remainingMs / answerTotalMs));
  const urgent = !timer.inReveal && timer.remainingSec <= COUNTDOWN_SEC;
  const participants = state.moji.players
    .filter((p) => p.position !== null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const waitingNames = participants.filter((p) => !p.active).map((p) => p.name);

  // 入力した文字（かな1文字）を送って決定する
  const decide = async () => {
    const c = [...text.trim()].at(-1) ?? "";
    if (!c || sending) return;
    setSending(true);
    try {
      if (c !== round.myChar) {
        const ok = await send({ type: "mojiInput", char: c });
        if (!ok) return;
      }
      await send({ type: "mojiLock", locked: true });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-2 sm:gap-5 px-3 py-2 sm:p-6">
      {/* 上部: 問題番号 + ゲージ */}
      <div className="flex items-center gap-3">
        <span className="hidden sm:block shrink-0">
          <span className="plaque px-3.5 py-1 text-base">
            第{state.moji.doneCount + 1}問
            <span className="text-xs opacity-70 font-sans font-bold">/ {state.moji.gameLength}</span>
          </span>
        </span>
        {/* 問題を読んでいる間と秒数が出たあとで高さが変わらないよう、秒数の行の高さに固定する */}
        <div className="flex-1 min-w-0 flex items-center gap-3 h-7">
          {timer.inReveal ? (
            <>
              <div className="gauge flex-1" />
              <span className="text-xs sm:text-sm text-muted animate-pulse whitespace-nowrap">問題を読んでいます…</span>
            </>
          ) : (
            <>
              <div className="gauge flex-1">
                <div className={`gauge-fill ${urgent ? "low" : ""}`} style={{ width: `${ratio * 100}%` }} />
              </div>
              <span
                className={`w-16 shrink-0 whitespace-nowrap text-right font-display text-lg sm:text-xl font-extrabold tabular-nums ${
                  urgent ? "text-crimson" : "text-gold-2"
                }`}
              >
                {timer.remainingSec}
                <span className="text-xs font-normal text-muted ml-0.5 font-sans">秒</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* 問題文 */}
      <section className="ornate ornate-lit relative px-3 py-2.5 sm:px-8 sm:py-8 min-h-20 sm:min-h-40 flex items-center justify-center overflow-hidden">
        {timer.inLeadIn ? (
          <span className="q-badge font-display text-gilt text-3xl sm:text-6xl font-extrabold tracking-[0.25em] pl-[0.25em] select-none">
            問題
          </span>
        ) : (
          <p className="font-display text-base sm:text-2xl font-semibold leading-snug sm:leading-relaxed text-center text-ink">
            <Typewriter text={question.q} timer={state.timer} nowServer={nowServer} />
          </p>
        )}
      </section>

      <p className="text-center text-xs sm:text-sm text-muted">
        答えの読み（かな）を、{round.length}人で1文字ずつ書いてください
      </p>

      {/* 1文字ずつの枠（参加順に左から） */}
      <section className="w-full flex justify-center">
        <ol
          className="grid gap-1.5 sm:gap-3 w-full"
          style={{ gridTemplateColumns: `repeat(${round.length}, minmax(0, 1fr))`, maxWidth: `${round.length * 6}rem` }}
        >
          {participants.map((p) => {
            const mine = p.isYou;
            return (
              <li
                key={p.id}
                className={`slot flex flex-col items-center gap-1 px-1 py-2 min-w-0 ${mine ? "slot-you" : ""} ${
                  p.locked ? "border-gold gold-glow" : ""
                }`}
              >
                <span className="text-[10px] sm:text-xs text-gold font-bold">{(p.position ?? 0) + 1}文字目</span>
                <span className="font-display text-2xl sm:text-4xl font-black leading-none h-8 sm:h-11 flex items-center text-ink">
                  {mine ? round.myChar ?? "" : p.locked ? "■" : p.typed ? "…" : ""}
                </span>
                <span className="text-[10px] sm:text-xs text-muted truncate max-w-full">{p.name}</span>
                <span className={`text-[10px] sm:text-xs ${p.locked ? "text-gold-2 font-bold" : "text-muted"}`}>
                  {p.locked ? "決定" : p.typed ? "入力中" : "未入力"}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* 自分の入力欄 */}
      {round.myPosition !== null ? (
        <section className="ornate-2 px-3 py-2 sm:p-5 flex flex-col items-center gap-2">
          <p className="font-display text-base sm:text-xl font-extrabold">
            あなたは <span className="text-gilt">{round.myPosition + 1}文字目</span> の担当です
          </p>
          {round.myLocked ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted">「{round.myChar}」で決定しました</span>
              <button type="button" onClick={() => void send({ type: "mojiLock", locked: false })} className="btn-ghost px-4 py-1.5 text-sm">
                取り消す
              </button>
            </div>
          ) : (
            <form
              className="flex gap-2 w-full max-w-xs"
              onSubmit={(e) => {
                e.preventDefault();
                void decide();
              }}
            >
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="done"
                placeholder={canInput ? "かな1文字" : "読み上げ中…"}
                className="field flex-1 min-w-0 px-3 py-2 text-center text-2xl font-black placeholder:text-base placeholder:font-normal"
                aria-label={`${round.myPosition + 1}文字目`}
              />
              <button type="submit" disabled={!canInput || !text.trim() || sending} className="btn-gold shrink-0 px-5 py-2 text-base">
                決定
              </button>
            </form>
          )}
          <p className="text-[11px] sm:text-xs text-muted text-center">
            ひらがなでもカタカナでもかまいません。小さい「っ」「ゃ」なども、大きい字で書いて大丈夫です。
          </p>
        </section>
      ) : (
        <p className="text-center text-sm text-muted">
          {state.moji.isPlayer ? "この問題は見学です。次の問題から参加します。" : "観戦中です。"}
        </p>
      )}

      <MojiPlayersPanel room={room} compact />

      {urgent && !round.waiting && <div aria-hidden className="danger-vignette pointer-events-none fixed inset-0 z-20" />}

      {/* 答える人の離席待ち */}
      {round.waiting && (
        <div className="fixed inset-0 z-40 bg-bg/85 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="rise-in ornate ornate-lit w-full max-w-md p-6 sm:p-8 text-center">
            <p className="font-display text-gilt text-3xl font-extrabold tracking-widest mb-6">一時停止中</p>
            <p className="text-lg mb-6">
              <span className="font-bold text-gold-2">{waitingNames.join("・") || "参加者"}</span>
              <span className="text-ink">さんの復帰を待っています</span>
            </p>
            {state.you.isHost &&
              participants
                .filter((p) => !p.active)
                .map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void send({ type: "mojiKick", id: p.id })}
                    className="btn-ghost px-4 py-2 text-sm m-1"
                  >
                    {p.name}さんを外す（この問題は中止）
                  </button>
                ))}
            <p className="text-xs text-muted mt-4">
              タブを閉じたり通信が切れたりした場合は、15秒ほどで自動的に外れ、この問題は中止になります。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
