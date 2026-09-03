"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { getLocalName, getLocalToken, setLocalName } from "@/hooks/useRoom";
import OrnateTitle from "@/components/OrnateTitle";
import RulesContent from "@/components/RulesContent";

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(getLocalName());
  }, []);

  async function createRoom() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("名前を入力してください");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      setLocalName(trimmed);
      // トークンは全ルーム共通のローカルIDを使う
      const token = getLocalToken();
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, token }),
      });
      const data = (await res.json()) as { roomId?: string; token?: string; error?: string };
      if (!res.ok || !data.roomId) {
        setError(data.error ?? "ルーム作成に失敗しました");
        setCreating(false);
        return;
      }
      if (data.token) localStorage.setItem("ta-token", data.token);
      router.push(`/room/${data.roomId}`);
    } catch {
      setError("通信エラーが発生しました");
      setCreating(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-7 sm:gap-8 px-4 py-10 sm:p-8">
      {/* 題字 */}
      <div className="text-center flex flex-col items-center gap-3">
        <Image
          src="/ornaments/emblem.svg"
          alt=""
          width={220}
          height={176}
          priority
          unoptimized
          className="w-40 sm:w-52 h-auto drop-shadow-[0_10px_24px_rgba(0,0,0,0.6)]"
        />
        <OrnateTitle as="p" className="w-64 sm:w-80">
          3人協力型クイズゲーム
        </OrnateTitle>
        <h1 className="font-display text-gilt text-5xl sm:text-7xl font-extrabold tracking-wide leading-none">
          Three Answer
        </h1>
      </div>

      {/* あそびかた */}
      <div className="ornate ornate-lit max-w-lg w-full p-4 sm:p-6">
        <OrnateTitle className="mb-4">はじめての方へ</OrnateTitle>
        <RulesContent />
      </div>

      {/* ルーム作成 */}
      <div className="ornate-2 max-w-lg w-full p-4 sm:p-6 space-y-4">
        <label className="block">
          <span className="text-sm text-muted">あなたの名前</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createRoom()}
            maxLength={20}
            placeholder="例: たろう"
            className="field mt-1 w-full px-3 py-2.5"
          />
        </label>
        <button
          onClick={createRoom}
          disabled={creating}
          className="btn-gold w-full py-3.5 text-lg tracking-[0.25em] pl-[0.25em]"
        >
          {creating ? "作成中…" : "ルームを作る"}
        </button>
        {error && <p className="text-player-a text-sm">{error}</p>}
        <p className="text-xs text-muted">
          ルームを作るとURLが発行されます。URLを共有すれば、開くだけで参加できます。
        </p>
      </div>

      {/* 原案クレジット */}
      <div className="ornate-2 max-w-lg w-full p-4 sm:p-6 space-y-4">
        <OrnateTitle>原案　カプリティオチャンネル</OrnateTitle>
        <p className="text-sm text-ink/90 leading-relaxed">
          このゲームは、クイズ法人カプリティオのYouTubeチャンネル「カプリティオチャンネル」の動画
          『【30択】協力して正解せよ‼️』で考案・実演された協力型カードゲームに着想を得た、
          ファンによる非公式のWebアプリです。素晴らしいゲームへのリスペクトを込めて制作しました。
        </p>

        <div className="relative w-full overflow-hidden rounded-lg border border-gold-3 bg-black aspect-video">
          <iframe
            className="absolute inset-0 h-full w-full"
            src="https://www.youtube-nocookie.com/embed/5Q5BLPpKVcY"
            title="カプリティオチャンネル - 原案となった動画"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <a
            href="https://www.youtube.com/watch?v=5Q5BLPpKVcY"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold hover:underline"
          >
            YouTubeで動画を見る ↗
          </a>
          <a
            href="https://www.youtube.com/channel/UCA5eUNhmpBCbT-IJxBvP5tA"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold hover:underline"
          >
            カプリティオチャンネル ↗
          </a>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          本アプリはカプリティオおよび関係各社とは一切関係のない非公式作品です。
          問題はオリジナルに作成しており、動画内の問題は使用していません。
        </p>
      </div>
    </main>
  );
}
