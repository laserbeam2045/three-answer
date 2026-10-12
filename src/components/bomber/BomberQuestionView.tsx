"use client";

import { useEffect, useRef, useState } from "react";
import BombIcon from "@/components/bomber/BombIcon";
import BomberSlots from "@/components/bomber/BomberSlots";
import BomberPlayersBar from "@/components/bomber/BomberPlayersBar";
import BomberMissList from "@/components/bomber/BomberMissList";
import BomberPanels from "@/components/bomber/BomberPanels";
import OrnateTitle from "@/components/OrnateTitle";
import { useTimer } from "@/hooks/useTimer";
import type { UseRoomResult } from "@/hooks/useRoom";

/** 残りこの秒数からカウントダウンを大きく出す（番組と同じ5秒） */
const COUNTDOWN_SEC = 5;

export default function BomberQuestionView({ room }: { room: UseRoomResult }) {
  const { state, send, nowServer } = room;
  const timer = useTimer(state?.timer ?? null, nowServer);
  const [text, setText] = useState("");
  // 判定待ちの回答の数。判定中でも次の答えを送れるよう、送信は止めない
  const [pending, setPending] = useState(0);
  const composingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const round = state?.bomber.round ?? null;
  const canAnswer = !!round?.isYourTurn && !timer.inReveal && !round.waiting;

  // 自分の番が来たら入力欄にフォーカス。
  // 入力欄は参加者には常に出しておき、一度タップしておけばフォーカスが外れないので、
  // スマホでもキーボードが開いたまま自分の番を迎えられる（スマホはタップ以外の自動フォーカスではキーボードが開かない）
  useEffect(() => {
    if (canAnswer) inputRef.current?.focus();
  }, [canAnswer]);

  // 自分の番が来た合図（目障りにならない程度）: 画面のふちが約1.4秒金色に光り、「あなたの番です」が小さく弾む。
  // スマホでは短く1回振動する。ほかの人がお休み（パス）して自分が続けて答えるときも、1回ごとに合図を出す。
  // 1人だけで答えている（ほかの全員がお休み・1人プレイ）ときは、毎回出ると目障りなので、最初の1回だけ。
  const players = state?.bomber.players ?? [];
  const othersPlaying = players.some((p) => !p.isYou && !p.resting);
  const turnKey = canAnswer && round ? `${state?.qIndex}:${round.slots.length}` : null;
  const prevTurnKey = useRef<string | null>(null);
  const [turnPulse, setTurnPulse] = useState(0);
  const [edgeOn, setEdgeOn] = useState(false);
  useEffect(() => {
    const prev = prevTurnKey.current;
    prevTurnKey.current = turnKey;
    if (!turnKey || turnKey === prev) return;
    // 続けて自分の番（直前も自分の番だった）なら、ほかに答える人がいるときだけ合図を出す
    if (prev && !othersPlaying) return;
    setTurnPulse((n) => n + 1);
    setEdgeOn(true);
    const t = window.setTimeout(() => setEdgeOn(false), 1400);
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!calm) navigator.vibrate?.(60);
    return () => window.clearTimeout(t);
  }, [turnKey, othersPlaying]);

  // ほかの人がこの問題をお休み（パス）したら、画面の上に小さく知らせる
  const restingNames = players.filter((p) => p.resting && !p.isYou).map((p) => p.name);
  const restingKey = restingNames.join("/");
  const prevResting = useRef<string[]>([]);
  const [restNotice, setRestNotice] = useState<{ text: string; key: number } | null>(null);
  useEffect(() => {
    const before = prevResting.current;
    prevResting.current = restingNames;
    const added = restingNames.filter((n) => !before.includes(n));
    if (added.length === 0) return;
    setRestNotice({ text: `${added.join("さん・")}さんがこの問題をお休みしました`, key: Date.now() });
    const t = window.setTimeout(() => setRestNotice(null), 3000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restingKey]);

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
    if (!t || !canAnswer) return;
    setPending((n) => n + 1);
    setText("");
    void send({ type: "bomberAnswer", text: t }).finally(() => {
      setPending((n) => n - 1);
      inputRef.current?.focus();
    });
  };

  const miss = round.lastMiss;
  // この問題をお休み（パス）しているか
  const resting = !!state.bomber.players.find((p) => p.isYou)?.resting;

  return (
    // スマホは1画面に収まるよう、余白と高さを詰める（sm 以上は従来のサイズ）
    <div className="flex-1 w-full max-w-4xl mx-auto flex flex-col gap-2 sm:gap-5 px-3 py-2 sm:p-6">
      {/* 上部: 問題番号 + 導火線ゲージ。スマホでは問題番号はヘッダーにあるので出さない */}
      <div className="flex items-center gap-3">
        <span className="hidden sm:block shrink-0">
          <span className="plaque px-3.5 py-1 text-base">
            第{state.qIndex + 1}問
            <span className="text-xs opacity-70 font-sans font-bold">/ {state.questionCount}</span>
          </span>
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
          <div className="q-ripple relative flex flex-col items-center justify-center">
            <span className="q-badge font-display text-gilt text-3xl sm:text-6xl font-extrabold tracking-[0.25em] pl-[0.25em] select-none">
              問題
            </span>
          </div>
        ) : (
          <p className="font-display text-base sm:text-2xl font-semibold leading-snug sm:leading-relaxed text-center text-ink">
            {timer.inReveal ? <span className="typewriter-caret">{shownText}</span> : shownText}
          </p>
        )}
        {urgent && timer.remainingSec > 0 && (
          <span
            key={timer.remainingSec}
            aria-live="assertive"
            className="countdown-pop absolute right-3 bottom-0 sm:right-6 sm:bottom-2 font-display text-crimson text-4xl sm:text-7xl font-black pointer-events-none"
          >
            {timer.remainingSec}
          </span>
        )}
      </section>

      {/* パネル問題: 出題のパネルを並べ、正解したものから埋まっていく */}
      {round.panels && !timer.inLeadIn && (
        <section>
          <OrnateTitle className="mb-1 sm:mb-2">
            パネルを全部うめろ！（あと{round.panels.filter((p) => !p.display).length}枚）
          </OrnateTitle>
          <BomberPanels panels={round.panels} />
        </section>
      )}

      {/* 回答枠（誰がどの順に答えるか）。パネル問題はパネルが埋まっていくので出さない */}
      {!round.panels && (
        <section>
          <OrnateTitle className="mb-1 sm:mb-2">
            答えを{round.target}個つなげ！
          </OrnateTitle>
          <BomberSlots
            filled={round.slots}
            upcoming={round.upcoming}
            target={round.target}
            urgent={urgent}
          />
        </section>
      )}

      {/* 回答エリア */}
      <section
        className={`ornate-2 px-3 py-2 sm:p-5 flex flex-col items-center gap-1.5 sm:gap-2.5 ${
          round.isYourTurn && !round.waiting ? "your-turn" : ""
        }`}
      >
        {round.isYourTurn ? (
          <p
            key={turnPulse}
            className="turn-bump your-turn-label font-display text-lg sm:text-2xl font-extrabold tracking-widest flex items-center gap-2"
          >
            <BombIcon urgent={urgent} className="w-6 h-6 sm:w-9 sm:h-9" />
            {/* 金色の文字は背景を文字の形に切り抜いて出すので、帯の背景とは別の要素にする */}
            <span className="text-gilt">あなたの番です</span>
          </p>
        ) : (
          <p className="text-sm sm:text-lg text-ink flex items-center gap-2">
            <BombIcon urgent={urgent} className="w-5 h-5 sm:w-8 sm:h-8" />
            <span className="font-bold text-gold-2">{round.turnName}</span>
            <span className="text-muted">さんが回答中…</span>
          </p>
        )}

        {/* この問題をお休み（パス）中の人には、入力欄の代わりに案内を出す */}
        {resting && (
          <p className="text-sm text-muted text-center">
            この問題はお休み中です。次の問題から順番に戻ります。
          </p>
        )}

        {/* 参加者には入力欄を常に出す（自分の番の前に答えを用意しておける。送れるのは自分の番だけ） */}
        {state.bomber.isPlayer && !resting && (
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
              maxLength={40}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="send"
              placeholder={
                canAnswer
                  ? "答えを入力"
                  : round.isYourTurn
                    ? "問題文が出たら送れます"
                    : "自分の番に備えて入力しておけます"
              }
              className={`field flex-1 min-w-0 px-3 py-2 sm:py-2.5 text-base sm:text-lg ${canAnswer ? "" : "opacity-75"}`}
              aria-label="答え"
            />
            <button
              type="submit"
              disabled={!canAnswer || !text.trim()}
              className="btn-gold shrink-0 px-4 sm:px-5 py-2 sm:py-2.5 text-base"
            >
              {pending > 0 && !text.trim() ? "判定中…" : "答える"}
            </button>
          </form>
        )}

        {/* 直前の誤答（全員に見える）。無いときは場所を空けない */}
        {miss && (
          <p key={`${miss.name}-${miss.seq}`} className="miss-shake text-sm sm:text-base text-center">
            <span className="font-black text-crimson mr-1.5">×</span>
            {!round.isYourTurn && <span className="text-muted mr-1">{miss.name}:</span>}
            <span className="text-ink">「{miss.text}」</span>
            <span className="text-muted text-xs sm:text-sm ml-1">
              {miss.reason === "dup" ? "はもう出ています" : "は違います"}
            </span>
          </p>
        )}
      </section>

      {/* この問題で出た誤答（全員に見える） */}
      {round.misses.length > 0 && (
        <section className="w-full">
          <p className="text-center text-xs text-muted mb-1 sm:mb-1.5">この問題の誤答（{round.misses.length}）</p>
          <BomberMissList misses={round.misses} animateLatest />
        </section>
      )}

      {/* 参加者（途中参加・途中で抜ける） */}
      <BomberPlayersBar room={room} />

      {/* 自分の番が来た瞬間に、画面のふちが一度だけ金色に光る */}
      {edgeOn && round.isYourTurn && (
        <div key={turnPulse} aria-hidden className="turn-edge pointer-events-none fixed inset-0 z-20" />
      )}

      {/* ほかの人のお休み（パス）の知らせ */}
      {restNotice && (
        <div
          key={restNotice.key}
          role="status"
          className="rise-in fixed top-14 left-1/2 -translate-x-1/2 z-30 w-[min(92vw,26rem)] rounded-lg border border-line bg-panel/95 px-3 py-1.5 text-center text-xs sm:text-sm text-ink/90 shadow-lg pointer-events-none"
        >
          {restNotice.text}
        </div>
      )}

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
            <p className="text-xs text-muted mt-4">
              タブを閉じたり通信が切れたりした場合は、15秒ほどで自動的に次の人へ回ります。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
