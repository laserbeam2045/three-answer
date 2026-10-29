"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Collapse from "@/components/Collapse";
import type { BomberImageView } from "@/lib/types";

/**
 * 写真パネルの出典（撮影者・ライセンス）。写真は Wikimedia Commons のもので、CC BY などの表示義務を満たすために出す。
 * 元の画像ページへのリンクは、ファイル名に答えが入っていることが多いので、答え合わせのあと（sourceUrl があるとき）だけ出す。
 */
export function BomberPhotoCredits({ items }: { items: { label: string; image: BomberImageView }[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="w-full max-w-2xl mx-auto mt-1 sm:mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mx-auto flex items-center gap-1 text-[10px] sm:text-xs text-muted hover:text-ink transition-colors cursor-pointer"
      >
        写真の出典（Wikimedia Commons）
        <span className={`transition-transform duration-300 ease-out ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      <Collapse open={open}>
        <ul className="mt-1 space-y-0.5 text-[10px] sm:text-xs text-muted leading-snug">
          {items.map(({ label, image }) => (
            <li key={label} className="break-all">
              <span className="text-gold-3 font-bold mr-1">{label}</span>
              {image.author}
              {" / "}
              {image.licenseUrl ? (
                <a href={image.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">
                  {image.license}
                </a>
              ) : (
                image.license
              )}
              {image.sourceUrl && (
                <>
                  {" / "}
                  <a href={image.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    元の画像
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      </Collapse>
    </div>
  );
}

/** 開く・閉じる動きの長さ */
const OPEN_MS = 340;
const CLOSE_MS = 300;
const SNAP_BACK_MS = 220;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** パネルの写真（rounded-md）と大きい写真（rounded-lg）の角の丸み */
const THUMB_RADIUS = 6;
const FRAME_RADIUS = 8;
/** これより上下に動かすか、これより速く払ったら閉じる */
const DISMISS_PX = 90;
const DISMISS_SPEED = 0.6; // px/ms
/** これ以上動いたらタップではなくスワイプとみなす */
const TAP_SLOP = 8;

const FULL_CLIP = `inset(0px 0px round ${FRAME_RADIUS}px)`;
const REST = "translate(0px, 0px) scale(1)";

function prefersReducedMotion(): boolean {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** 大きく見せるときの写真の大きさ（画面の幅92%・高さ70%に収め、元の大きさより大きくはしない） */
function fitSize(nw: number, nh: number): { w: number; h: number } {
  const maxW = window.innerWidth * 0.92;
  const maxH = window.innerHeight * 0.7;
  if (!nw || !nh) return { w: Math.round(Math.min(maxW, 480)), h: Math.round(Math.min(maxH, 360)) };
  const k = Math.min(1, maxW / nw, maxH / nh);
  return { w: Math.round(nw * k), h: Math.round(nh * k) };
}

/**
 * 大きい写真の枠（transform をかけていないときの位置 frame、大きさ w×h）を、パネルの写真（thumb。object-cover で
 * 切り抜いて表示している）にぴったり重ねる transform と clip-path。パネルで見えている部分だけを残して、
 * その部分がパネルの位置・大きさに来るようにする
 */
function thumbPose(thumb: DOMRect, frame: DOMRect, w: number, h: number): Keyframe {
  const thumbAspect = thumb.width / thumb.height;
  // パネルで見えている部分の大きさ（大きい写真の座標で）
  const wide = w / h > thumbAspect;
  const cw = wide ? h * thumbAspect : w;
  const ch = wide ? h : w / thumbAspect;
  const k = thumb.width / cw;
  const dx = thumb.left + thumb.width / 2 - (frame.left + frame.width / 2);
  const dy = thumb.top + thumb.height / 2 - (frame.top + frame.height / 2);
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${k})`,
    clipPath: `inset(${(h - ch) / 2}px ${(w - cw) / 2}px round ${THUMB_RADIUS / k}px)`,
  };
}

/** 画面に見えているか（スクロールで外れていたら、そこへは戻さない） */
function onScreen(r: DOMRect): boolean {
  return r.width > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
}

/**
 * 写真を大きく見る。パネルの写真の位置から滑らかに広がって開き、閉じるときはパネルの位置へ縮んで収まる。
 * タップ・上下へのスワイプ・Esc で閉じる。スワイプ中は写真が指についてきて、少しだけなら元に戻る
 */
export function BomberPhotoZoom({
  label,
  image,
  caption,
  getOrigin,
  onClose,
}: {
  label: string;
  image: BomberImageView;
  caption: string | null;
  /** パネルの写真の要素（開く・閉じる動きの起点。見つからないときは、その場で拡大・縮小する） */
  getOrigin: () => HTMLImageElement | null;
  onClose: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const closing = useRef(false);
  const drag = useRef<{
    id: number;
    x0: number;
    y0: number;
    dy: number;
    moved: boolean;
    samples: { y: number; t: number }[];
  } | null>(null);
  const [size, setSize] = useState(() => {
    const o = getOrigin();
    return fitSize(o?.naturalWidth ?? 0, o?.naturalHeight ?? 0);
  });

  /** transform をかけていないときの枠の位置（枠は画面の中央に置いていて、transform は中心を基準にかける） */
  const restRect = useCallback(() => {
    const r = frameRef.current!.getBoundingClientRect();
    const t = getComputedStyle(frameRef.current!).transform;
    const m = new DOMMatrixReadOnly(t === "none" ? undefined : t);
    const cx = r.left + r.width / 2 - m.e;
    const cy = r.top + r.height / 2 - m.f;
    return new DOMRect(cx - size.w / 2, cy - size.h / 2, size.w, size.h);
  }, [size]);

  // 開く: パネルの写真の位置・大きさから広げる（最初の1回だけ）
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame || prefersReducedMotion()) return;
    const els = [frame, backRef.current, infoRef.current];
    // 開発時は2回呼ばれるので、前の動きを止めてから、動かしていない位置で測る
    els.forEach((el) => el?.getAnimations().forEach((a) => a.cancel()));
    const thumb = getOrigin()?.getBoundingClientRect();
    const from: Keyframe =
      thumb && onScreen(thumb)
        ? thumbPose(thumb, frame.getBoundingClientRect(), size.w, size.h)
        : { transform: "translate(0px, 0px) scale(0.85)", clipPath: FULL_CLIP };
    frame.animate([from, { transform: REST, clipPath: FULL_CLIP }], { duration: OPEN_MS, easing: EASE });
    backRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-out" });
    infoRef.current?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.6 }, { opacity: 1 }], { duration: OPEN_MS + 100 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 画面の大きさ（スマホの縦横）が変わったら合わせる
  useEffect(() => {
    const onResize = () => {
      const img = frameRef.current?.querySelector("img");
      if (img?.naturalWidth) setSize(fitSize(img.naturalWidth, img.naturalHeight));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /** 閉じる: いまの位置からパネルの位置へ縮んで収まる（パネルが画面外なら、払った向きへ小さくなって消える） */
  const close = useCallback(
    (dir: number = 0) => {
      if (closing.current) return;
      closing.current = true;
      drag.current = null;
      const frame = frameRef.current;
      if (!frame || prefersReducedMotion()) {
        onClose();
        return;
      }
      const cs = getComputedStyle(frame);
      const from: Keyframe = { transform: cs.transform === "none" ? REST : cs.transform, clipPath: cs.clipPath };
      const rest = restRect();
      frame.getAnimations().forEach((a) => a.cancel());
      const thumb = getOrigin()?.getBoundingClientRect();
      const to: Keyframe =
        thumb && onScreen(thumb)
          ? thumbPose(thumb, rest, size.w, size.h)
          : { transform: `translate(0px, ${dir * window.innerHeight * 0.4}px) scale(0.6)`, clipPath: FULL_CLIP, opacity: 0 };
      const anim = frame.animate([from, to], { duration: CLOSE_MS, easing: EASE, fill: "forwards" });
      for (const el of [backRef.current, infoRef.current]) {
        if (!el) continue;
        const o = getComputedStyle(el).opacity;
        el.getAnimations().forEach((a) => a.cancel());
        el.animate([{ opacity: o }, { opacity: 0 }], { duration: CLOSE_MS, easing: "ease-in", fill: "forwards" });
      }
      anim.onfinish = () => onClose();
    },
    [getOrigin, onClose, restRect, size]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  /** スワイプ中: 写真を指に合わせて動かし、上下に離れるほど小さく、背景を薄くする */
  const follow = (dx: number, dy: number) => {
    const p = Math.min(1, Math.abs(dy) / (window.innerHeight * 0.5));
    if (frameRef.current) frameRef.current.style.transform = `translate(${dx}px, ${dy}px) scale(${1 - p * 0.3})`;
    if (backRef.current) backRef.current.style.opacity = String(1 - p * 0.85);
    if (infoRef.current) infoRef.current.style.opacity = String(Math.max(0, 1 - p * 3));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (closing.current || drag.current || (e.pointerType === "mouse" && e.button !== 0)) return;
    // 開く動き・戻る動きの途中でつかんだら、その位置から動かす
    for (const el of [frameRef.current, backRef.current, infoRef.current]) {
      if (!el) continue;
      const cs = getComputedStyle(el);
      const t = cs.transform;
      const o = cs.opacity;
      el.getAnimations().forEach((a) => a.cancel());
      if (el === frameRef.current) el.style.transform = t === "none" ? "" : t;
      else el.style.opacity = o;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dy: 0, moved: false, samples: [{ y: e.clientY, t: e.timeStamp }] };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || closing.current) return;
    const dx = e.clientX - d.x0;
    d.dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, d.dy) < TAP_SLOP) return;
    d.moved = true;
    d.samples.push({ y: e.clientY, t: e.timeStamp });
    if (d.samples.length > 8) d.samples.shift();
    follow(dx, d.dy);
  };

  /** 少しだけ動かして離したら、元の位置・大きさに戻す */
  const snapBack = () => {
    const frame = frameRef.current;
    if (frame) {
      const from = frame.style.transform || REST;
      frame.style.transform = "";
      frame.animate([{ transform: from }, { transform: REST }], { duration: SNAP_BACK_MS, easing: EASE });
    }
    for (const el of [backRef.current, infoRef.current]) {
      if (!el) continue;
      const from = el.style.opacity || "1";
      el.style.opacity = "";
      el.animate([{ opacity: from }, { opacity: 1 }], { duration: SNAP_BACK_MS, easing: "ease-out" });
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (closing.current) return;
    if (!d.moved) {
      close();
      return;
    }
    // 離す直前（約0.1秒）の上下の速さ
    const first = d.samples.find((s) => e.timeStamp - s.t <= 100) ?? d.samples[d.samples.length - 1];
    const speed = e.timeStamp > first.t ? (e.clientY - first.y) / (e.timeStamp - first.t) : 0;
    if (Math.abs(d.dy) > DISMISS_PX || Math.abs(speed) > DISMISS_SPEED) close(Math.sign(d.dy || speed));
    else snapBack();
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    drag.current = null;
    if (!closing.current) snapBack();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`写真${label}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 p-4 cursor-zoom-out select-none touch-none overscroll-contain"
    >
      <div ref={backRef} aria-hidden className="absolute inset-0 bg-black/80" />
      <div
        ref={frameRef}
        className="relative shrink-0 overflow-hidden bg-black/30 shadow-2xl will-change-transform"
        style={{ width: size.w, height: size.h, clipPath: FULL_CLIP }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image.src}
          alt={`写真${label}`}
          className="h-full w-full object-cover"
          draggable={false}
          onLoad={(e) => {
            // パネルの写真がまだ読み込めていなかったときは、読み込めた大きさに合わせ直す
            const next = fitSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight);
            if (next.w !== size.w || next.h !== size.h) setSize(next);
          }}
        />
      </div>
      <div ref={infoRef} className="relative flex flex-col items-center gap-2">
        <p className="font-display text-gold-2 text-lg font-black">
          {label}
          {caption && <span className="ml-2 text-gilt">{caption}</span>}
        </p>
        <p className="text-[10px] sm:text-xs text-white/60 text-center break-all">
          {image.author} / {image.license}
        </p>
      </div>
    </div>
  );
}
