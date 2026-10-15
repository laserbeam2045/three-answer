// 写真パネル用の画像を Wikimedia Commons から取ってきて public/bomber-img/ に置く。
//
// 使い方: node scripts/fetch-commons-images.mjs <入力.json> <出力マニフェスト.json>
//   入力: [{ "id": "dog-shiba", "ja": "柴犬" }, { "id": "x", "file": "File:Foo.jpg" }, ...]
//     - ja: 日本語版ウィキペディアの記事名。記事の代表画像（Commons のもの）を使う
//     - file: Commons のファイル名を直接指定する（代表画像が合わないとき）
//   出力: id ごとの { src, author, license, licenseUrl, sourceUrl, file }。既にあるものは取り直さない。
//
// - ファイル名は id から作った意味のない文字列にする（ファイル名から答えが分からないように）
// - 再利用できるライセンス（CC0・パブリックドメイン・CC BY・CC BY-SA）の画像だけを使う
// - 取ってきた画像は、必ず目で見て、問題の答えと合っているか確かめること
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("使い方: node scripts/fetch-commons-images.mjs <入力.json> <出力マニフェスト.json>");
  process.exit(1);
}
const UA = "ThreeAnswerQuizImages/1.0 (https://github.com/laserbeam2045/three-answer)";
const WIDTH = 500;
const IMG_DIR = path.join(process.cwd(), "public", "bomber-img");
fs.mkdirSync(IMG_DIR, { recursive: true });

const items = JSON.parse(fs.readFileSync(inPath, "utf8"));
const manifest = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};

const api = async (host, params) => {
  const url = `https://${host}/w/api.php?` + new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};
const stripHtml = (s) =>
  (s ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const OK_LICENSE = /^(cc0|public domain|pd\b|pd-|cc by(-sa)? \d|cc-by(-sa)?-\d)/i;

for (const item of items) {
  if (manifest[item.id] && !item.force) continue;
  try {
    let file = item.file;
    if (!file) {
      const r = await api("ja.wikipedia.org", { action: "query", prop: "pageimages", piprop: "name", titles: item.ja, redirects: "1" });
      const name = r.query?.pages?.[0]?.pageimage;
      if (!name) throw new Error(`代表画像なし: ${item.ja}`);
      file = `File:${name}`;
    }
    const r = await api("commons.wikimedia.org", {
      action: "query",
      titles: file,
      prop: "imageinfo",
      iiprop: "url|extmetadata|mime",
      iiurlwidth: String(WIDTH),
    });
    const info = r.query?.pages?.[0]?.imageinfo?.[0];
    if (!info) throw new Error(`Commons に情報なし: ${file}`);
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value);
    if (!OK_LICENSE.test(license)) throw new Error(`使えないライセンス: ${license} (${file})`);
    const author = stripHtml(meta.Artist?.value) || stripHtml(meta.Credit?.value) || "不明";
    const thumb = info.thumburl ?? info.url;
    const ext = (path.extname(new URL(thumb).pathname).toLowerCase() || ".jpg").replace(".jpeg", ".jpg");
    const hash = crypto.createHash("sha1").update(`three-answer:${item.id}`).digest("hex").slice(0, 12);
    const res = await fetch(thumb, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`画像の取得に失敗: ${res.status} ${thumb}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(path.join(IMG_DIR, `${hash}${ext}`), buf);
    manifest[item.id] = {
      src: `/bomber-img/${hash}${ext}`,
      author: author.slice(0, 120),
      license,
      licenseUrl: stripHtml(meta.LicenseUrl?.value) || undefined,
      sourceUrl: info.descriptionurl,
      file,
    };
    console.log(`ok   ${item.id}  ${file}  ${license}  ${(buf.length / 1024).toFixed(0)}KB`);
  } catch (e) {
    console.log(`FAIL ${item.id}  ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 300));
}
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n");
