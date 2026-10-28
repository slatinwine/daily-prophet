// 《预言家日报》静态构建脚本 —— 供 GitHub Pages / GitHub Actions 每小时定时重建
// 零依赖：node build.js 生成 index.html
const fs = require("fs");

// ---------------- 新闻源 ----------------
const SOURCES = [
  { name: "机器之心", section: "魔法世界头条", url: "https://www.jiqizhixin.com/rss", type: "rss" },
  { name: "量子位", section: "魔法世界头条", url: "https://www.qbitai.com/feed", type: "rss" },
  { name: "雷峰网", section: "魔法世界头条", url: "https://www.leiphone.com/feed", type: "rss" },
  {
    name: "澎湃新闻",
    section: "麻瓜世界要闻",
    url: "https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar",
    type: "json",
    pick: (d) =>
      ((d.data && d.data.hotNews) || []).slice(0, 8).map((s) => ({
        title: s.name,
        link: s.link || "https://www.thepaper.cn/newsDetail_forward_" + s.contId,
        image: s.pic && !s.pic.includes("fastNewsWwwBig") ? s.pic : "",
        hint: s.pubTimeNew || "",
      })),
  },
  {
    name: "澎湃·编辑部精选",
    section: "猫头鹰编辑部精选",
    url: "https://cache.thepaper.cn/contentapi/wwwIndex/rightSidebar",
    type: "json",
    pick: (d) =>
      ((d.data && d.data.editorHandpicked) || []).slice(0, 6).map((s) => ({
        title: s.name,
        link: s.link || "https://www.thepaper.cn/newsDetail_forward_" + s.contId,
        image: s.smallPic && !s.smallPic.includes("fastNews") ? s.smallPic : "",
        hint: s.pubTimeNew || "",
      })),
  },
  { name: "华尔街见闻", section: "古灵阁财经版", url: "https://dedicated.wallstreetcn.com/rss.xml", type: "rss" },
  { name: "IT之家", section: "魔文与符咒快讯", url: "https://www.ithome.com/rss/", type: "rss" },
  { name: "少数派", section: "麻瓜生活工艺", url: "https://sspai.com/feed", type: "rss" },
  { name: "Solidot", section: "奇闻异事司", url: "https://www.solidot.org/index.rss", type: "rss" },
  {
    name: "B站热搜",
    section: "奇闻异事司",
    url: "https://api.bilibili.com/x/web-interface/search/square?limit=10",
    type: "json",
    pick: (d) =>
      (((d.data || {}).trending || {}).list || []).slice(0, 8).map((k) => ({
        title: k.show_name || k.keyword,
        link: "https://search.bilibili.com/all?keyword=" + encodeURIComponent(k.keyword),
        image: (k.icon || "").replace(/^http:/, "https:"),
        hint: "",
      })),
  },
];

// ---------------- RSS 解析（正则版） ----------------
function decodeXml(s) {
  if (!s) return "";
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function stripTags(s) {
  if (!s) return "";
  return decodeXml(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function firstTag(item, tag) {
  const m = item.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i"));
  return m ? m[1].trim() : "";
}
function firstAttr(item, tag, attr) {
  const m = item.match(new RegExp("<" + tag + "[^>]*\\b" + attr + '="([^"]+)"', "i"));
  return m ? m[1] : "";
}
function parseRss(xml) {
  const items = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const raw of blocks.slice(0, 10)) {
    const title = stripTags(firstTag(raw, "title"));
    const link = stripTags(firstTag(raw, "link")) || firstAttr(raw, "link", "href");
    const desc = stripTags(firstTag(raw, "description"));
    const image =
      firstAttr(raw, "enclosure", "url") ||
      firstAttr(raw, "media:content", "url") ||
      (raw.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] ||
      "";
    if (title) items.push({ title, link, desc: desc.slice(0, 120), image });
  }
  return items;
}

// ---------------- 抓取 ----------------
async function fetchOne(src) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(src.url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", Accept: "*/*" },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const items = src.type === "json" ? src.pick(JSON.parse(text)) || [] : parseRss(text);
    return { section: src.section, source: src.name, ok: items.length > 0, items };
  } catch (e) {
    return { section: src.section, source: src.name, ok: false, items: [], error: String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const esc = (s) =>
  String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 静态托管没有服务端代理，用 weserv 公共图片 CDN 绕过图床防盗链
const img = (u, cls) =>
  u
    ? `<div class="photo ${cls}"><img src="https://images.weserv.nl/?url=${encodeURIComponent(u.replace(/^https?:\/\//, ""))}&w=900&output=jpg&q=82" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.closest('.photo').style.display='none'"></div>`
    : "";

// ---------------- 魔法元素 ----------------
function wizardDate() {
  const now = new Date(Date.now() + 8 * 3600 * 1000); // 北京时间
  const weekdays = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"];
  const stars = ["摩羯","水瓶","双鱼","白羊","金牛","双子","巨蟹","狮子","处女","天秤","天蝎","射手"];
  const d = now.getUTCDate();
  const moon = ["🌑 新月","🌒 蛾眉月","🌓 上弦月","🌔 盈凸月","🌕 满月","🌖 亏凸月","🌗 下弦月","🌘 残月"][Math.floor((d / 30) * 8) % 8];
  const star = stars[(now.getUTCMonth() + 1) % 12];
  const weather = ["晴 · 禁林边缘有薄雾","多云 · 猫头鹰飞行条件良好","小雨 · 记得带上隐形衣","晴间多云 · 好天气适合骑扫帚"][d % 4];
  const cn = now.toISOString().slice(0, 10).replace(/^(\d+)-(\d+)-(\d+)$/, (_m, y, mo, dd) => `${y}年${parseInt(mo)}月${parseInt(dd)}日`);
  return { line: `${cn} ${weekdays[now.getUTCDay()]} · ${moon} · ${star}座宜占卜 · 霍格沃茨：${weather}`, stamp: cn };
}

function render(groups) {
  const wd = wizardDate();
  const ok = groups.filter((g) => g.ok);
  const main = ok[0] || { items: [] };
  const hero = main.items.find((i) => i.image) || main.items[0] || null;
  const rest = main.items.filter((i) => i !== hero).slice(0, 8);

  const storyHtml = (i, cls) => `
    <article class="story">
      ${img(i.image, cls)}
      <h3><a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a></h3>
      ${i.hint ? `<span class="stamp">${esc(i.hint)} · 猫头鹰送达</span>` : ""}
      ${i.desc ? `<p>${esc(i.desc)}</p>` : ""}
    </article>`;

  let heroHtml = "";
  if (hero) {
    heroHtml = `
    <div class="hero">
      ${img(hero.image, "moving")}
      <h2 class="headline"><a href="${esc(hero.link)}" target="_blank" rel="noopener">${esc(hero.title)}</a></h2>
      ${hero.desc ? `<p class="lede">${esc(hero.desc)}</p>` : ""}
    </div>`;
  }

  const columnItems = rest.map((i) => storyHtml(i, "small")).join("");

  const otherSections = ok.slice(1).map(
    (g) => `
    <section class="column-block">
      <h2 class="column-title">${esc(g.section)}</h2>
      <p class="column-sub">—— ${(g.sources || []).map(esc).join(" · ")} 特约供稿 ——</p>
      ${g.items.slice(0, 6).map((i) => storyHtml(i, "tiny")).join("")}
    </section>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="预言家日报 —— 哈利波特魔法报纸风格的每日新闻，魔法世界即 AI 世界">
<title>预言家日报 · The Daily Prophet</title>
<style>
  :root {
    --ink: #3b2a1a; --ink-light: #6b5138; --accent: #7a1f1f; --gold: #8a6d1d;
    --paper: #ece0c4; --paper-dark: #e2d3af;
    --serif: "Noto Serif SC", "Source Han Serif SC", "STSong", "SimSun", Georgia, serif;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: var(--serif); color: var(--ink);
    background:
      radial-gradient(ellipse at 20% 0%, rgba(122,31,31,.06), transparent 55%),
      radial-gradient(ellipse at 80% 100%, rgba(138,109,29,.08), transparent 55%),
      linear-gradient(180deg, #1a120a 0%, #241809 100%);
    min-height: 100vh; padding: 28px 12px 60px;
  }
  .sheet {
    max-width: 1080px; margin: 0 auto;
    background:
      repeating-linear-gradient(0deg, transparent, transparent 26px, rgba(107,81,56,.035) 27px),
      radial-gradient(ellipse at 15% 10%, rgba(122,31,31,.05), transparent 45%),
      radial-gradient(ellipse at 85% 90%, rgba(138,109,29,.06), transparent 45%),
      linear-gradient(160deg, var(--paper) 0%, var(--paper-dark) 55%, #d9c69c 100%);
    box-shadow: 0 30px 80px rgba(0,0,0,.65), inset 0 0 120px rgba(120,85,40,.22);
    border: 1px solid #c9b483; padding: 40px 48px 56px; position: relative;
    animation: unfold .8s ease-out;
  }
  @keyframes unfold { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }
  .sheet::before {
    content: ""; position: absolute; inset: 10px;
    border: 2px solid rgba(122,31,31,.35);
    outline: 1px solid rgba(138,109,29,.4); outline-offset: 4px; pointer-events: none;
  }
  .masthead { text-align: center; border-bottom: 3px double var(--ink); padding-bottom: 14px; position: relative; }
  .masthead .crest { font-size: 15px; letter-spacing: .5em; color: var(--gold); margin-bottom: 6px; }
  h1.title {
    font-size: clamp(44px, 8vw, 76px); letter-spacing: .18em; font-weight: 900;
    text-shadow: 1px 1px 0 rgba(255,250,230,.6), 3px 3px 6px rgba(59,42,26,.25);
  }
  .masthead .en { font-size: 14px; letter-spacing: .55em; color: var(--accent); margin-top: 4px; text-transform: uppercase; }
  .dateline {
    display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 6px;
    border-bottom: 1px solid var(--ink-light); padding: 8px 2px; font-size: 13px;
    color: var(--ink-light); letter-spacing: .08em;
  }
  .dateline .price::before { content: "☽ "; color: var(--gold); }
  .hero { text-align: center; padding: 26px 0 10px; border-bottom: 2px solid var(--ink); margin-bottom: 22px; }
  .photo {
    position: relative; display: inline-block; overflow: hidden;
    background: linear-gradient(160deg, #d8c8a0, #c3ad7e);
    border: 3px solid var(--ink); box-shadow: 4px 4px 0 rgba(59,42,26,.35);
  }
  .photo img { display: block; width: 100%; height: 100%; object-fit: cover; filter: sepia(.35) contrast(1.02); animation: kenburns 14s ease-in-out infinite alternate; }
  .photo.small img, .photo.tiny img { animation: kenburns2 9s ease-in-out infinite alternate; }
  .column-block:nth-child(odd) .photo img { animation-name: kenburns3; animation-duration: 11s; }
  .photo::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(115deg, transparent 30%, rgba(255,246,214,.28) 48%, transparent 62%);
    background-size: 260% 100%; animation: shimmer 5.5s ease-in-out infinite;
  }
  .photo.moving { width: min(560px, 92%); aspect-ratio: 16/9; }
  .photo.small { width: 100%; aspect-ratio: 16/9; margin-bottom: 8px; }
  .photo.tiny { width: 100%; aspect-ratio: 21/9; margin-bottom: 8px; border-width: 2px; }
  @keyframes kenburns { from { transform: scale(1) translate(0,0); } to { transform: scale(1.12) translate(-2%, 2%); } }
  @keyframes kenburns2 { from { transform: scale(1.08) translate(2%, -1%); } to { transform: scale(1) translate(0, 0); } }
  @keyframes kenburns3 { from { transform: scale(1.05) translate(-1%, 1%); } to { transform: scale(1) translate(1%, -1%); } }
  @keyframes shimmer { 0%, 100% { background-position: 120% 0; } 50% { background-position: -20% 0; } }
  .headline { font-size: clamp(26px, 4.5vw, 40px); font-weight: 900; margin: 18px auto 10px; line-height: 1.35; letter-spacing: .04em; }
  .headline a { color: var(--ink); text-decoration: none; }
  .headline a:hover { color: var(--accent); text-decoration: underline; }
  .lede { max-width: 640px; margin: 0 auto; color: var(--ink-light); font-size: 15px; line-height: 1.9; text-align: justify; }
  .lede::first-letter { font-size: 2em; color: var(--accent); font-weight: 900; }
  .front-page { display: grid; grid-template-columns: 1.4fr 1fr; gap: 30px; }
  @media (max-width: 760px) { .front-page { grid-template-columns: 1fr; } }
  .column-block h2.column-title {
    font-size: 20px; font-weight: 900; letter-spacing: .3em; text-align: center;
    color: var(--accent); border-bottom: 2px solid var(--ink); padding-bottom: 8px; margin-bottom: 4px;
  }
  .front-col h2.column-title { font-size: 22px; }
  .column-sub { text-align: center; font-size: 11px; color: var(--ink-light); letter-spacing: .2em; margin-bottom: 14px; }
  .stamp {
    display: inline-block; font-size: 10.5px; color: var(--accent);
    border: 1px solid rgba(122,31,31,.4); padding: 1px 7px; margin: 2px 0 6px;
    letter-spacing: .1em; border-radius: 2px; background: rgba(122,31,31,.05);
  }
  .story { margin-bottom: 20px; break-inside: avoid; }
  .story h3 { font-size: 17px; line-height: 1.5; margin-bottom: 6px; }
  .story h3 a { color: var(--ink); text-decoration: none; }
  .story h3 a:hover { color: var(--accent); text-decoration: underline; }
  .story p { font-size: 13.5px; line-height: 1.85; color: var(--ink-light); text-align: justify; }
  .footer {
    margin-top: 34px; padding-top: 16px; border-top: 3px double var(--ink);
    text-align: center; font-size: 12px; color: var(--ink-light); letter-spacing: .15em; line-height: 2;
  }
  .footer .owl::before { content: "🦉 "; }
  .empty { text-align: center; padding: 60px 0; color: var(--ink-light); }
  .candle { position: fixed; top: -60px; font-size: 22px; z-index: 5; animation: floatdown linear infinite; opacity: .9; pointer-events: none; }
  @keyframes floatdown {
    0% { transform: translateY(-60px) translateX(0) rotate(-4deg); }
    50% { transform: translateY(50vh) translateX(14px) rotate(4deg); }
    100% { transform: translateY(110vh) translateX(-8px) rotate(-3deg); }
  }
</style>
</head>
<body>
  <div class="candle" style="left:6%; animation-duration:16s;">🕯️</div>
  <div class="candle" style="left:88%; animation-duration:21s; animation-delay:5s;">🕯️</div>
  <div class="candle" style="left:46%; animation-duration:26s; animation-delay:11s;">🕯️</div>

  <main class="sheet">
    <header class="masthead">
      <div class="crest">✦ 猫头鹰邮政特许发行 · 麻瓜亦可订阅 ✦</div>
      <h1 class="title">预言家日报</h1>
      <div class="en">The Daily Prophet</div>
    </header>
    <div class="dateline">
      <span class="price">每份 5 个加隆（麻瓜免费）</span>
      <span>${esc(wd.line)}</span>
      <span>第 ${new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear() - 1991 + 1} 卷 · 霍格莫德印刷</span>
    </div>

    ${ok.length === 0
      ? `<div class="empty">🦉 猫头鹰们今天全部迷路了，请一小时后再放飞一次。</div>`
      : `<div class="hero">${heroHtml}</div>
         <div class="front-page">
           <section class="column-block front-col">
             <h2 class="column-title">${esc(main.section)}</h2>
             <p class="column-sub">—— ${(main.sources || []).map(esc).join(" · ")} 特约供稿 ——</p>
             ${columnItems || "<p class='empty'>暂无更多消息。</p>"}
           </section>
           <div>${otherSections}</div>
         </div>`}

    <footer class="footer">
      <p class="owl">本刊由猫头鹰邮递自动系统（GitHub Actions）每小时投递 · 印刷于 ${esc(wd.stamp)}</p>
      <p>编者按：魔法世界即 AI 世界 · 本报刊登的一切魔法事件均以麻瓜新闻为底稿 · 拒绝丽塔·斯基特式谣言</p>
    </footer>
  </main>
</body>
</html>`;
}

async function main() {
  const results = await Promise.allSettled(SOURCES.map(fetchOne));
  const raw = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { section: "杂项", source: "未知", ok: false, items: [], error: "fetch rejected" }
  );
  const groups = [];
  const bySec = new Map();
  for (const s of raw) {
    if (!bySec.has(s.section)) {
      const g = { section: s.section, sources: [], items: [], ok: false };
      bySec.set(s.section, g);
      groups.push(g);
    }
    const g = bySec.get(s.section);
    g.sources.push(s.source);
    if (s.ok) { g.items.push(...s.items); g.ok = true; }
  }
  const html = render(groups);
  fs.writeFileSync("index.html", html, "utf8");
  const okCount = groups.filter((g) => g.ok).length;
  console.log(`印刷完成：${okCount}/${groups.length} 个栏目，index.html ${html.length} 字节`);
  if (okCount === 0) process.exit(1);
}

main();
