"use client";

import { useEffect, useRef, useState } from "react";
import BombIcon from "@/components/bomber/BombIcon";
import BomberSlots from "@/components/bomber/BomberSlots";
import OrnateTitle from "@/components/OrnateTitle";
import { useTimer } from "@/hooks/useTimer";
import type { UseRoomResult } from "@/hooks/useRoom";

/** 残りこの秒数からカウントダウンを大きく出す（番組と同じ5秒） */
const COUNTDOWN_SEC = 5;

export default function BomberQuestionView({ room }: { room: UseRoomResult }) {
  const { state, send, nowServer } = room;
  const timer = useTimer(state?.timer ?? null, nowServer);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const round = state?.bomber.round ?? null;
  const canAnswer = !!round?.isYourTurn && !timer.inReveal && !round.waiting;

  // 自分の番が来たら入力欄にフォーカス
  useEffect(() => {
    if (canAnswer) inputRef.current?.focus();
  }, [canAnswer]);

  // 問題が変わったら入力をクリア
  const qIndex = state?.qIndex ?? 0;
  useEffect(() => setText(""), [qIndex]);

  if (!state || !state.question || !round || !state.timer) return null;

  const { question } = state;
  const shownText = timer.inReveal
    ? question.q.slice(0, Math.floor(timer.revealProgress * question.qLength))
    : question.q;

  const answerTotalMs = Math.max(1, state.timer.totalMs - state.timer.revealMs);
  const ratio = Math.max(0, Math.min(1, timer.remainingMs / answerTotalMs));
  const urgent = !timer.inReveal && timer.remainingSec <= COUNTDOWN_SEC;

  const submit = () => {
    const t = text.trim();
    if (!t || !canAnswer || sending) return;
    setSending(true);
    setText("");
    void send({ type: "bomberAnswer", text: t }).finally(() => {
      setSending(false);
      inputRef.current?.focus();
    });
  };

  const miss = round.lastMiss;

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-3 sm:gap-5 p-3 sm:p-6">
      {/* 上部: 問題番号 + 導火線ゲージ */}
      <div className="flex items-center gap-3">
        <span className="plaque shrink-0 px-3.5 py-1 text-sm sm:text-base">
          第{state.qIndex + 1}問
          <span className="text-xs opacity-70 font-sans font-bold">/ {state.questionCount}</span>
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-3">
          {timer.inReveal ? (
            <>
              <div className="gauge flex-1" />
              <span className="text-xs sm:text-sm text-muted animate-pulse whitespace-nowrap">
                問題を読んでいます…
              </span>
            </>
          ) : (
            <>
              <div className="gauge flex-1">
                <div className={`gauge-fill ${urgent ? "low" : ""}`} style={{ width: `${ratio * 100}%` }} />
              </div>
              <span
                className={`w-12 text-right font-display text-xl font-extrabold tabular-nums ${
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
      <section className="ornate ornate-lit relative px-2 py-4 sm:px-8 sm:py-8 min-h-28 sm:min-h-40 flex items-center justify-center overflow-hidden">
        {timer.inLeadIn ? (
          <div className="q-ripple relative flex flex-col items-center justify-center">
            <span className="q-badge font-display text-gilt text-4xl sm:text-6xl font-extrabold tracking-[0.25em] pl-[0.25em] select-none">
              問題
            </span>
          </div>
        ) : (
          <p className="font-display text-lg sm:text-2xl font-semibold leading-relaxed text-center text-ink">
            {timer.inReveal ? <span className="typewriter-caret">{shownText}</span> : shownText}
          </p>
        )}
        {urgent && timer.remainingSec > 0 && (
          <span
            key={timer.remainingSec}
            aria-live="assertive"
            className="countdown-pop absolute right-3 bottom-1 sm:right-6 sm:bottom-2 font-display text-crimson text-5xl sm:text-7xl font-black pointer-events-none"
          >
            {timer.remainingSec}
          </span>
        )}
      </section>

      {/* 5つの回答枠 */}
      <section>
        <OrnateTitle className="mb-1 sm:mb-2">答えを5つつなげ！</OrnateTitle>
        <BomberSlots filled={round.slots} upcoming={round.upcoming} urgent={urgent} />
      </section>

      {/* 回答エリア */}
      <section className="ornate-2 p-3 sm:p-5 flex flex-col items-center gap-2.5">
        {round.isYourTurn ? (
          <>
            <p className="font-display text-gilt text-xl sm:text-2xl font-extrabold tracking-widest flex items-center gap-2">
              <BombIcon urgent={urgent} className="w-7 h-7 sm:w-9 sm:h-9" />
              あなたの番です
            </p>
            <form
              className="w-full max-w-md flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (composingRef.current) return;
                submit();
              }}
            >
              <input
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onCompositionStart={() => (composingRef.current = true)}
                onCompositionEnd={() => (composingRef.current = false)}
                disabled={!canAnswer}
                maxLength={40}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="send"
                placeholder={timer.inReveal ? "問題文が出たら答えられます" : "答えを入力"}
                className="field flex-1 min-w-0 px-3 py-2.5 text-lg"
                aria-label="答え"
              />
              <button
                type="submit"
                disabled={!canAnswer || !text.trim() || sending}
                className="btn-gold shrink-0 px-5 py-2.5 text-base"
              >
                {sending ? "判定中…" : "答える"}
              </button>
            </form>
          </>
        ) : (
          <p className="text-base sm:text-lg text-ink flex items-center gap-2">
            <BombIcon urgent={urgent} className="w-6 h-6 sm:w-8 sm:h-8" />
            <span className="font-bold text-gold-2">{round.turnName}</span>
            <span className="text-muted">さんが回答中…</span>
          </p>
        )}

        {/* 直前の誤答（全員に見える） */}
        <div className="min-h-7">
          {miss && (
            <p key={`${miss.name}-${miss.seq}`} className="miss-shake text-sm sm:text-base text-center">
              <span className="font-black text-crimson mr-1.5">×</span>
              <span className="text-ink">「{miss.text}」</span>
              <span className="text-muted text-xs sm:text-sm ml-1">
                {miss.reason === "dup" ? "はもう出ています" : "は違います"}
              </span>
            </p>
          )}
        </div>
      </section>

      {/* 残り5秒: 画面の縁が赤く脈打つ */}
      {urgent && !round.waiting && (
        <div aria-hidden className="danger-vignette pointer-events-none fixed inset-0 z-20" />
      )}

      {/* 回答者の離席待ち */}
      {round.waiting && (
        <div className="fixed inset-0 z-40 bg-bg/85 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="rise-in ornate ornate-lit w-full max-w-md p-6 sm:p-8 text-center">
            <p className="font-display text-gilt text-3xl font-extrabold tracking-widest mb-6">一時停止中</p>
            <p className="text-lg mb-6">
              <span className="font-bold text-gold-2">{round.turnName}</span>
              <span className="text-ink">さんの復帰を待っています</span>
            </p>
            {state.you.isHost ? (
              <button
                type="button"
                onClick={() => void send({ type: "bomberKick", token: round.turnToken })}
                className="btn-ghost px-4 py-2 text-sm"
              >
                {round.turnName}さんを外して次の人へ
              </button>
            ) : (
              <p className="text-sm text-muted">タイマーは全員の画面で停止しています。</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
