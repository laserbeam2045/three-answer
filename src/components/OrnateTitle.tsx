import type { ReactNode } from "react";

/** 飾り罫と菱形つきの見出し。各パネルの題字に使う */
export default function OrnateTitle({
  children,
  className = "",
  as: Tag = "h2",
}: {
  children: ReactNode;
  className?: string;
  as?: "h1" | "h2" | "h3" | "p";
}) {
  return (
    <Tag className={`title-ornate text-xs sm:text-sm ${className}`}>
      <span className="dia" aria-hidden>
        ◆
      </span>
      <span className="min-w-0">{children}</span>
      <span className="dia" aria-hidden>
        ◆
      </span>
    </Tag>
  );
}
