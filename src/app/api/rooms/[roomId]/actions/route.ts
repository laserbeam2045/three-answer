import { NextRequest, NextResponse } from "next/server";
import type { Action, BomberAnswerHint } from "@/lib/types";
import { applyAction, EngineError, normalizeRoom, tick } from "@/lib/engine";
import { cleanAnswerInput, questionNeedingAi } from "@/lib/bomber/engine";
import { judgeWithJev } from "@/lib/bomber/jev";
import { redact } from "@/lib/redact";
import { getStore, RoomNotFoundError } from "@/lib/store";
import { storeErrorResponse } from "../../storeError";
import { allSets, getBomberSet, getSet } from "@/lib/sets";

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
  "setMode",
  "setBomberSeconds",
  "bomberJoin",
  "bomberLeave",
  "bomberRest",
  "bomberKick",
  "bomberAnswer",
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

  // 受付時刻。AI 判定を待つ間に時間切れ扱いにならないよう、この時刻で判定する
  const now = Date.now();
  const store = getStore();
  try {
    // 在席の記録と状態の読み込みを1回で行う（Redis の月間リクエスト数を節約する）
    const { state: current, presence } = await store.touchAndLoad(roomId, token, true, now);
    if (!current) throw new RoomNotFoundError();

    // ファイブボンバーの回答がローカルの照合で一致しなければ、表記ゆれを AI（Jev）で判定しておく。
    // 外部 API の待ち時間を CAS のリトライに含めないよう、書き込みの前に済ませる
    let bomberHint: BomberAnswerHint | undefined;
    if (action.type === "bomberAnswer") {
      normalizeRoom(current);
      const input = cleanAnswerInput(action.text);
      const question = questionNeedingAi(current, token, input, getBomberSet);
      if (question) {
        const answerIndex = await judgeWithJev(question, input);
        if (answerIndex >= 0) bomberHint = { qIndex: current.qIndex, text: input, answerIndex };
      }
    }

    // AI 判定を待った場合は、その間にほかの人の操作が入っているかもしれないので読み直す
    const state = await store.mutate(
      roomId,
      (s) => {
        // アクション適用前にも遅延遷移（期限切れ等）を評価する
        tick(s, presence, now, getSet);
        applyAction(s, token, action, presence, now, getSet, allSets, getBomberSet, bomberHint);
        tick(s, presence, now, getSet);
        return true;
      },
      bomberHint ? undefined : current
    );
    const redacted = redact(state, presence, token, now, getSet, allSets, false);
    return NextResponse.json({ state: redacted, serverNow: now });
  } catch (e) {
    if (e instanceof RoomNotFoundError) {
      return NextResponse.json({ error: "ルームが見つかりません" }, { status: 404 });
    }
    if (e instanceof EngineError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    return storeErrorResponse(e);
  }
}
