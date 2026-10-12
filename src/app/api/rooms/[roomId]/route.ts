import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { ensureClient, tick } from "@/lib/engine";
import { redact } from "@/lib/redact";
import { getStore, RoomNotFoundError } from "@/lib/store";
import { storeErrorResponse } from "../storeError";
import { allSets, getSet } from "@/lib/sets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const tokenGen = customAlphabet(
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  24
);

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await ctx.params;
  const url = req.nextUrl;
  let token = url.searchParams.get("token") ?? "";
  if (!token || token.length < 8) token = tokenGen();
  const visible = url.searchParams.get("visible") !== "0";
  const spectatorReveal = url.searchParams.get("reveal") === "1";
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 20) || undefined;
  const now = Date.now();

  const store = getStore();
  try {
    // 在席の記録と状態の読み込みを1回で行う（Redis の月間リクエスト数を節約する）
    const { state: loaded, presence } = await store.touchAndLoad(roomId, token, visible, now);
    if (!loaded) throw new RoomNotFoundError();

    const state = await store.mutate(
      roomId,
      (s) => {
        const addedClient = ensureClient(s, token, name);
        const ticked = tick(s, presence, now, getSet);
        return addedClient || ticked; // 変化がなければ書き込まない
      },
      loaded
    );

    const redacted = redact(state, presence, token, now, getSet, allSets, spectatorReveal);
    return NextResponse.json({ state: redacted, serverNow: now });
  } catch (e) {
    if (e instanceof RoomNotFoundError) {
      return NextResponse.json({ error: "ルームが見つかりません" }, { status: 404 });
    }
    return storeErrorResponse(e);
  }
}
