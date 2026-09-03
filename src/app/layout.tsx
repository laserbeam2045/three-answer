import type { Metadata, Viewport } from "next";
import "./globals.css";


// フォントは Google Fonts から実行時に読み込む（本文: Noto Sans JP / 見出し・札・演出: Shippori Mincho B1）。
// next/font で束ねると日本語フォントのスライス（各240件超）をビルド時に取得する必要があり、
// ネットワーク事情でビルドが落ちるため、<link> で読む方式にしている。
const FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Shippori+Mincho+B1:wght@600;800&display=swap";

export const metadata: Metadata = {
  title: "Three Answer - 3人協力型クイズゲーム",
  description:
    "3人のプレイヤーが手札のひらがなカードを出し合って答える、協力型クイズゲーム。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONT_CSS} />
      </head>
      <body className="font-sans antialiased stage">{children}</body>
    </html>
  );
}
