import { NextRequest, NextResponse } from "next/server";
import type { Action, BomberAnswerHint } from "@/lib/types";
import { applyAction, EngineError, normalizeRoom, tick } from "@/lib/engine";
import { cleanAnswerInput, questionNeedingAi } from "@/lib/bomber/engine";
import { judgeWithJev } from "@/lib/bomber/jev";
import { loadMojiPool } from "@/lib/moji/pool";
import type { MojiQuestion } from "@/lib/types";
import { redact } from "@/lib/redact";
import { getStore, RoomNotFoundError } from "@/lib/store";
import { storeErrorResponse } from "../../storeError";
import { allSets, getBomberSet, getSet } from "@/lib/sets";

export const runtime = "nodejs";
// 保存先（Upstash Redis）が東京にあるので、関数も東京で動かす（米国東部だと1回の読み書きに約150msかかっていた）
export const preferredRegion = "hnd1";
export const dynamic = "force-dynamic";

// この関数（インスタンス）が起動した時刻。起動直後の遅さ（コールドスタート）を見分けるため Server-Timing に出す
const BOOTED_AT = Date.now();
let served = 0;

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
  "setMojiSeconds",
  "mojiJoin",
  "mojiLeave",
  "mojiKick",
  "mojiInput",
  "mojiLock",
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await ctx.params;
  let body: { token?: string; action?: Action; actionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエストです" }, { status: 400 });
  }
  const token = body.token;
  const action = body.action;
  // 送り直しで二重に反映しないための操作の ID（無くてもよい）
  const actionId = typeof body.actionId === "string" && /^[a-zA-Z0-9]{8,40}$/.test(body.actionId) ? body.actionId : undefined;
  const seen = (s: { recentActionIds?: string[] }) => !!actionId && !!s.recentActionIds?.includes(actionId);
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "tokenが必要です" }, { status: 400 });
  }
  if (!action || typeof action !== "object" || !VALID_TYPES.has(action.type)) {
    return NextResponse.json({ error: "不正なアクションです" }, { status: 400 });
  }

  // 受付時刻。AI 判定を待つ間に時間切れ扱いにならないよう、この時刻で判定する
  const now = Date.now();
  const store = getStore();
  const cold = served++ === 0;
  const t0 = performance.now();
  let tLoad = 0;
  let tJev = 0;
  try {
    // 在席の記録と状態の読み込みを1回で行う（Redis の月間リクエスト数を節約する）
    const { state: current, presence } = await store.touchAndLoad(roomId, token, true, now);
    tLoad = performance.now() - t0;
    if (!current) throw new RoomNotFoundError();

    // ファイブボンバーの回答がローカルの照合で一致しなければ、表記ゆれを AI（Jev）で判定しておく。
    // 外部 API の待ち時間を CAS のリトライに含めないよう、書き込みの前に済ませる
    let bomberHint: BomberAnswerHint | undefined;
    if (action.type === "bomberAnswer" && !seen(current)) {
      normalizeRoom(current);
      const input = cleanAnswerInput(action.text);
      const question = questionNeedingAi(current, token, input, getBomberSet);
      if (question) {
        const tj = performance.now();
        const answerIndex = await judgeWithJev(question, input);
        tJev = performance.now() - tj;
        if (answerIndex >= 0) bomberHint = { qIndex: current.qIndex, text: input, answerIndex };
      }
    }

    // ひと文字リーグの開始・次の問題では、人数に合う問題を選ぶために候補を読み込んでおく
    let mojiPool: MojiQuestion[] | undefined;
    if (current.mode === "moji" && (action.type === "start" || action.type === "next")) mojiPool = await loadMojiPool();

    // AI 判定を待った場合は、その間にほかの人の操作が入っているかもしれないので読み直す
    const state = await store.mutate(
      roomId,
      (s) => {
        // 同じ操作の送り直し（すでに反映済み）なら、何もせず今の状態を返す
        if (seen(s)) return false;
        // アクション適用前にも遅延遷移（期限切れ等）を評価する
        tick(s, presence, now, getSet);
        applyAction(s, token, action, presence, now, getSet, allSets, getBomberSet, bomberHint, mojiPool);
        tick(s, presence, now, getSet);
        if (actionId) s.recentActionIds = [...(s.recentActionIds ?? []), actionId].slice(-40);
        return true;
      },
      bomberHint ? undefined : current
    );
    const redacted = redact(state, presence, token, now, getSet, allSets, false);
    const total = performance.now() - t0;
    // 重さの原因を調べられるよう、処理時間を返す（cold=1 は起動直後のインスタンス）
    return NextResponse.json(
      { state: redacted, serverNow: now },
      {
        headers: {
          "Server-Timing": `load;dur=${tLoad.toFixed(1)}, jev;dur=${tJev.toFixed(1)}, total;dur=${total.toFixed(1)}, cold;desc="${cold ? 1 : 0}", uptime;dur=${Date.now() - BOOTED_AT}`,
        },
      }
    );
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
