"use client";

import CardTile from "@/components/CardTile";
import OrnateTitle from "@/components/OrnateTitle";
import type { Role } from "@/lib/types";
import { ROLES } from "@/lib/types";

const ROLE_BG: Record<Role, string> = {
  A: "bg-player-a",
  B: "bg-player-b",
  C: "bg-player-c",
};

/** スロットの中身。hidden = 内容非公開（出す/出さないも分からない） */
export type SlotContent =
  | { kind: "hidden"; decided: boolean }
  | { kind: "card"; word: string }
  | { kind: "pass" };

export interface SlotView {
  role: Role;
  name: string;
  active: boolean;
  isYou: boolean;
  content: SlotContent;
}

/**
 * 3人の場のスロット。回答中の画面と判定画面で同じ見た目を共有する。
 * 回答中は他プレイヤーの内容を hidden にすることで、誰が何を出したかは
 * 判定画面まで分からない。
 */
export default function PlaySlots({
  slots,
  title,
  reveal = false,
}: {
  slots: SlotView[];
  title: string;
  /** true のとき、カード/出さないを順にめくる演出をつける */
  reveal?: boolean;
}) {
  const byRole = new Map(slots.map((s) => [s.role, s]));

  return (
    <section className="w-full">
      <OrnateTitle className="mb-2 sm:mb-3">{title}</OrnateTitle>
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {ROLES.map((role, i) => {
          const slot = byRole.get(role);
          if (!slot) return <div key={role} />;
          const { content } = slot;

          return (
            <div
              key={role}
              className={`${reveal ? "flip-in" : ""} slot ${
                slot.isYou ? "slot-you" : ""
              } p-2 sm:p-3 flex flex-col items-center gap-2 min-w-0 transition-colors`}
              style={reveal ? { animationDelay: `${i * 200}ms` } : undefined}
            >
              <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                <span className={`${ROLE_BG[role]} w-2.5 h-2.5 rounded-full shrink-0`} />
                <span className="text-xs sm:text-sm font-bold truncate">{slot.name}</span>
                {!slot.active && (
                  <span
                    className="shrink-0 w-2 h-2 rounded-full bg-muted/50"
                    title="離席中"
                    aria-label="離席中"
                  />
                )}
              </div>

              {content.kind === "card" ? (
                <CardTile word={content.word} role={role} size="sm" state="revealed" />
              ) : content.kind === "pass" ? (
                <div className="card-pass text-xs sm:text-sm px-3 py-3 sm:py-4 whitespace-nowrap">
                  出さない
                </div>
              ) : (
                <div
                  className={`card-back rounded-lg px-3 py-3 sm:py-4 text-xs sm:text-sm font-bold whitespace-nowrap ${
                    content.decided ? "card-back-decided" : "opacity-70"
                  }`}
                >
                  {content.decided ? "決定済み" : "考え中…"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
