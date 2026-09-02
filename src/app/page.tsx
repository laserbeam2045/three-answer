"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLocalName, getLocalToken, setLocalName } from "@/hooks/useRoom";
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
    <main className="min-h-dvh flex flex-col items-center justify-center gap-8 p-6">
      <div className="text-center">
        <p className="text-gold font-bold tracking-widest mb-2">3人協力型クイズゲーム</p>
        <h1 className="text-4xl sm:text-6xl font-black tracking-tight">
          <span className="text-gold">Three</span> Answer
        </h1>
      </div>

      <div className="max-w-lg w-full bg-panel rounded-2xl border border-line p-6 space-y-4">
        <h2 className="font-bold text-lg">あそびかた</h2>
        <RulesContent />
      </div>

      <div className="max-w-lg w-full bg-panel rounded-2xl border border-line p-6 space-y-4">
        <label className="block">
          <span className="text-sm text-muted">あなたの名前</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createRoom()}
            maxLength={20}
            placeholder="例: たろう"
            className="mt-1 w-full bg-panel-2 border border-line rounded-lg px-3 py-2 outline-none focus:border-gold"
          />
        </label>
        <button
          onClick={createRoom}
          disabled={creating}
          className="w-full bg-gold text-card-ink font-bold py-3 rounded-lg hover:brightness-110 disabled:opacity-50 transition"
        >
          {creating ? "作成中…" : "ルームを作る"}
        </button>
        {error && <p className="text-player-a text-sm">{error}</p>}
        <p className="text-xs text-muted">
          ルームを作るとURLが発行されます。URLを共有すれば、開くだけで参加できます。
        </p>
      </div>

      {/* 原案クレジット */}
      <div className="max-w-lg w-full bg-panel rounded-2xl border border-line p-6 space-y-4">
        <h2 className="font-bold text-lg">
          原案：<span className="text-gold">カプリティオチャンネル</span>
        </h2>
        <p className="text-sm text-ink/90 leading-relaxed">
          このゲームは、クイズ法人カプリティオのYouTubeチャンネル「カプリティオチャンネル」の動画
          『【30択】協力して正解せよ‼️』で考案・実演された協力型カードゲームに着想を得た、
          ファンによる非公式のWebアプリです。素晴らしいゲームへのリスペクトを込めて制作しました。
        </p>

        <div className="relative w-full overflow-hidden rounded-xl border border-line bg-black aspect-video">
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
