"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLocalName, getLocalToken, setLocalName } from "@/hooks/useRoom";

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
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
          カード<span className="text-gold">合体</span>クイズ
        </h1>
      </div>

      <div className="max-w-lg w-full bg-panel rounded-2xl border border-line p-6 space-y-4">
        <h2 className="font-bold text-lg">あそびかた</h2>
        <ul className="text-sm text-muted space-y-2 leading-relaxed">
          <li>・3人のプレイヤーに、それぞれ10枚のひらがなカードが配られます。自分の手札しか見えません。</li>
          <li>・クイズの正解は、場に出されたカードの読みをつなげた言葉。序盤は1枚、後半は2枚・3枚の合体で完成します。</li>
          <li>・正解に必要なカードを持つ人が過不足なく出せたときだけ正解。不要な人が出したり、必要な人が出さなかったら不正解！</li>
          <li>・相談は禁止。「自分の札が必要かどうか」を読み切るのがこのゲームの醍醐味です。</li>
          <li>・全20問。3人以外は観戦者として参加できます。</li>
        </ul>
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
    </main>
  );
}
