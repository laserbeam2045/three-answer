import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-sans-jp",
});

// 見出し・札・演出用の明朝体（Shippori Mincho B1）は Google Fonts から直接読み込む。
// next/font で束ねると日本語フォントのスライス（240件超）をビルド時に取得する必要があり、
// ネットワーク事情でビルドが落ちることがあるため、実行時に読む方式にしている。
const DISPLAY_FONT_CSS =
  "https://fonts.googleapis.com/css2?family=Shippori+Mincho+B1:wght@600;800&display=swap";

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
        <link rel="stylesheet" href={DISPLAY_FONT_CSS} />
      </head>
      <body className={`${notoSansJp.variable} font-sans antialiased stage`}>{children}</body>
    </html>
  );
}
