import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // 開発サーバー（.next）を動かしたまま本番ビルドの検証ができるよう、
  // 出力先を環境変数で切り替えられるようにする（例: NEXT_DIST_DIR=.next-build npm run build）。
  // 同じ .next を共有すると、開発サーバーが「Cannot find module './NNN.js'」で壊れる。
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
