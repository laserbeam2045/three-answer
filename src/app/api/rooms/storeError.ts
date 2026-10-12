import { NextResponse } from "next/server";

/**
 * 保存先（Redis）とのやり取りに失敗したときの応答。
 * 月間リクエスト数の上限に達したときなどに、画面で理由が分かるようにする（以前は 500 で中身が無く、
 * 画面が「ルームに接続中…」のまま止まっていた）。
 */
export function storeErrorResponse(e: unknown): NextResponse {
  const message = e instanceof Error ? e.message : String(e);
  console.error("[three-answer] store error:", message);
  const quota = /max requests limit|max daily request limit|limit exceeded/i.test(message);
  return NextResponse.json(
    {
      error: quota
        ? "サーバーの利用上限に達したため、いまは遊べません。時間をおいてから再読み込みしてください。"
        : "サーバーとの通信に失敗しました。しばらくしてから再読み込みしてください。",
      code: quota ? "quota" : "store",
    },
    { status: 503 }
  );
}
