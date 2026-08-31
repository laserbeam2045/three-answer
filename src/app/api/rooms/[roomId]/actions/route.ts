import { NextRequest, NextResponse } from "next/server";
import type { Action } from "@/lib/types";
import { applyAction, EngineError, tick } from "@/lib/engine";
import { redact } from "@/lib/redact";
import { getStore, RoomNotFoundError } from "@/lib/store";
import { allSets, getSet } from "@/lib/sets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES = new Set([
  "setName",
  "sit",
  "standUp",
  "selectSet",
  "setAnswerSeconds",
  "start",
  "select",
  "lock",
  "unlock",
  "next",
  "backToLobby",
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await ctx.params;
  let body: { token?: string; action?: Action };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const token = body.token;
  const action = body.action;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "tokenが必要です" }, { status: 400 });
  }
  if (!action || typeof action !== "object" || !VALID_TYPES.has(action.type)) {
    return NextResponse.json({ error: "不正なアクションです" }, { status: 400 });
  }

  const now = Date.now();
  const store = getStore();
  try {
    await store.touchPresence(roomId, token, true, now);
    const presence = await store.getPresence(roomId);
    const state = await store.mutate(roomId, (s) => {
      // アクション適用前にも遅延遷移（期限切れ等）を評価する
      tick(s, presence, now, getSet);
      applyAction(s, token, action, presence, now, getSet, allSets);
      tick(s, presence, now, getSet);
      return true;
    });
    const redacted = redact(state, presence, token, now, getSet, allSets, false);
    return NextResponse.json({ state: redacted, serverNow: now });
  } catch (e) {
    if (e instanceof RoomNotFoundError) {
      return NextResponse.json({ error: "ルームが見つかりません" }, { status: 404 });
    }
    if (e instanceof EngineError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    throw e;
  }
}
