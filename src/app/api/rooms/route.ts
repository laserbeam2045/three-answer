import { NextRequest, NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { createRoom } from "@/lib/engine";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const roomIdGen = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 10);
const tokenGen = customAlphabet("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 24);

export async function POST(req: NextRequest) {
  let name = "";
  let token = "";
  try {
    const body = await req.json();
    if (typeof body?.name === "string") name = body.name.trim().slice(0, 20);
    if (typeof body?.token === "string" && /^[a-zA-Z0-9]{8,64}$/.test(body.token)) {
      token = body.token;
    }
  } catch {
    // body無しでも可
  }
  const store = getStore();
  const roomId = roomIdGen();
  if (!token) token = tokenGen();
  const state = createRoom(roomId, token, name || "プレイヤー", Date.now());
  const ok = await store.createRoom(state);
  if (!ok) {
    return NextResponse.json({ error: "ルーム作成に失敗しました" }, { status: 500 });
  }
  return NextResponse.json({ roomId, token });
}
