"use client";

import { useEffect, useState } from "react";
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

/** 写真を大きく見る。背景をタップするか Esc で閉じる */
export function BomberPhotoZoom({
  label,
  image,
  caption,
  onClose,
}: {
  label: string;
  image: BomberImageView;
  caption: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`写真${label}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 cursor-zoom-out"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
        alt={`写真${label}`}
        className="max-w-[92vw] max-h-[70vh] rounded-lg object-contain shadow-2xl"
        draggable={false}
      />
      <p className="font-display text-gold-2 text-lg font-black">
        {label}
        {caption && <span className="ml-2 text-gilt">{caption}</span>}
      </p>
      <p className="text-[10px] sm:text-xs text-white/60 text-center break-all">
        {image.author} / {image.license}
      </p>
    </div>
  );
}
