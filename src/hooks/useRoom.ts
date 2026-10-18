"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, RedactedState } from "@/lib/types";

const TOKEN_KEY = "ta-token";
const NAME_KEY = "ta-name";

function randomToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  for (const b of arr) s += chars[b % chars.length];
  return s;
}

export function getLocalToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(TOKEN_KEY);
  if (!t) {
    t = randomToken();
    localStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

export function getLocalName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NAME_KEY) ?? "";
}

export function setLocalName(name: string): void {
  localStorage.setItem(NAME_KEY, name);
}

export interface UseRoomResult {
  state: RedactedState | null;
  fatalError: string | null;
  actionError: string | null;
  /** サーバーに接続できないときの理由（利用上限など）。つながったら null に戻る */
  connectionError: string | null;
  send: (action: Action) => Promise<boolean>;
  /** サーバー時刻に補正した現在時刻 */
  nowServer: () => number;
  spectatorReveal: boolean;
  setSpectatorReveal: (b: boolean) => void;
}

export function useRoom(roomId: string): UseRoomResult {
  const [state, setState] = useState<RedactedState | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [spectatorReveal, setSpectatorReveal] = useState(false);

  const tokenRef = useRef<string>("");
  const offsetRef = useRef<number>(0);
  const stateRef = useRef<RedactedState | null>(null);
  const inFlightRef = useRef(false);
  const revealRef = useRef(false);
  revealRef.current = spectatorReveal;
  // 送信中アクションの楽観的反映（サーバー応答前にUIへ反映し、応答が来たら上書き）
  const pendingRef = useRef<Action[]>([]);

  const applyOptimistic = (s: RedactedState, action: Action): RedactedState => {
    switch (action.type) {
      case "select":
        if (s.phase === "question" && s.mySelection && !s.mySelection.locked) {
          return { ...s, mySelection: { ...s.mySelection, cardIndex: action.cardIndex } };
        }
        return s;
      case "lock":
        if (s.phase === "question" && s.mySelection) {
          return { ...s, mySelection: { ...s.mySelection, locked: true } };
        }
        return s;
      case "unlock":
        if (s.phase === "question" && s.mySelection) {
          return { ...s, mySelection: { ...s.mySelection, locked: false } };
        }
        return s;
      case "selectSet":
        return { ...s, setId: action.setId };
      case "setAnswerSeconds":
        return { ...s, settings: { ...s.settings, answerSeconds: action.seconds } };
      case "setBomberSeconds":
        return { ...s, settings: { ...s.settings, bomberSecondsPerAnswer: action.seconds } };
      case "setMode":
        return s.mode === action.mode ? s : { ...s, mode: action.mode, setId: null };
      default:
        return s;
    }
  };

  const withPendingOverlay = (s: RedactedState): RedactedState =>
    pendingRef.current.reduce(applyOptimistic, s);

  // 前回受け取った状態（JSON）。ポーリングで同じ内容が返ってきたときは画面を描き直さない
  const lastJsonRef = useRef<string | null>(null);
  const acceptState = useCallback((s: RedactedState, serverNow: number, json?: string) => {
    const sample = serverNow - Date.now();
    offsetRef.current =
      offsetRef.current === 0 ? sample : offsetRef.current * 0.7 + sample * 0.3;
    if (stateRef.current && s.v < stateRef.current.v) return;
    if (json !== undefined && json === lastJsonRef.current && pendingRef.current.length === 0) return;
    lastJsonRef.current = json ?? null;
    stateRef.current = s;
    setState(withPendingOverlay(s));
  }, []);

  const poll = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const visible =
        typeof document !== "undefined" && document.visibilityState === "visible" ? "1" : "0";
      const reveal = revealRef.current ? "&reveal=1" : "";
      // 未登録クライアントの初回登録時に使われる表示名（登録済みなら無視される）
      const localName = getLocalName();
      const nameParam = localName ? `&name=${encodeURIComponent(localName)}` : "";
      const res = await fetch(
        `/api/rooms/${roomId}?token=${tokenRef.current}&visible=${visible}${reveal}${nameParam}`,
        { cache: "no-store" }
      );
      if (res.status === 404) {
        setFatalError("ルームが見つかりません。URLを確認してください。");
        return;
      }
      if (!res.ok) {
        // サーバー側の保存先に接続できない（利用上限など）ときは理由を出す。ほかの一時的なエラーは次のポーリングへ
        if (res.status === 503) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          setConnectionError(data?.error ?? "サーバーとの通信に失敗しました。");
        }
        return;
      }
      const data = (await res.json()) as { state: RedactedState; serverNow: number };
      setConnectionError(null);
      acceptState(data.state, data.serverNow, JSON.stringify(data.state));
    } catch {
      // ネットワーク断は無視（次のポーリングで回復）
    } finally {
      inFlightRef.current = false;
    }
  }, [roomId, acceptState]);

  useEffect(() => {
    tokenRef.current = getLocalToken();
    void poll();
    // ポーリングの間隔。保存先（Redis）の月間リクエスト数を節約するため、すぐには変わらない画面ほど空ける。
    // - ファイブボンバーの回答中: 爆弾が素早く回るので約0.5秒
    // - ロビー・結果画面: 約1.5秒
    // - それ以外: 約1秒
    // - タブを裏に回しているとき: 5秒（15秒通信が無いと自動で外れる判定に間に合う間隔）
    let lastPollAt = 0;
    const interval = setInterval(() => {
      const s = stateRef.current;
      const hidden = document.visibilityState !== "visible";
      const gap = hidden
        ? 5000
        : s?.mode === "bomber" && s.phase === "question"
          ? 450
          : s?.phase === "lobby" || s?.phase === "results"
            ? 1500
            : 950;
      const now = Date.now();
      if (now - lastPollAt < gap) return;
      lastPollAt = now;
      void poll();
    }, 250);
    const onVis = () => void poll();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
  }, [poll]);

  const send = useCallback(
    async (action: Action): Promise<boolean> => {
      // 楽観的反映: サーバー応答を待たず即座にUIへ
      pendingRef.current.push(action);
      if (stateRef.current) setState(withPendingOverlay(stateRef.current));
      const removePending = () => {
        const i = pendingRef.current.indexOf(action);
        if (i !== -1) pendingRef.current.splice(i, 1);
      };
      try {
        const res = await fetch(`/api/rooms/${roomId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: tokenRef.current, action }),
        });
        if (res.status === 404) {
          removePending();
          setFatalError("ルームが見つかりません。");
          return false;
        }
        const data = (await res.json()) as
          | { state: RedactedState; serverNow: number }
          | { error: string };
        removePending();
        if (!res.ok) {
          const msg = "error" in data ? data.error : "操作に失敗しました";
          setActionError(msg);
          setTimeout(() => setActionError(null), 3000);
          // 楽観的反映を巻き戻す（最新のサーバー状態で再描画 + 再ポーリング）
          if (stateRef.current) setState(withPendingOverlay(stateRef.current));
          void poll();
          return false;
        }
        if ("state" in data) acceptState(data.state, data.serverNow);
        return true;
      } catch {
        removePending();
        setActionError("通信エラーが発生しました");
        setTimeout(() => setActionError(null), 3000);
        if (stateRef.current) setState(withPendingOverlay(stateRef.current));
        return false;
      }
    },
    [roomId, poll, acceptState]
  );

  const nowServer = useCallback(() => Date.now() + offsetRef.current, []);

  return { state, fatalError, actionError, connectionError, send, nowServer, spectatorReveal, setSpectatorReveal };
}
