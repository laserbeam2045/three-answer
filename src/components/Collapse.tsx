import type { ReactNode } from "react";

/**
 * 開閉する中身。高さを 0 ⇔ 中身の高さで EaseOut に動かす（grid の行の高さ 0fr ⇔ 1fr を遷移させる）。
 * 閉じている間もレンダリングはしておき、見えない中身にはフォーカスが入らないよう inert にする。
 * 動きを減らす設定の端末では、アニメーションせずに切り替える。
 */
export default function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className={`grid collapse-ease ${
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
      }`}
      aria-hidden={!open}
      inert={!open}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
