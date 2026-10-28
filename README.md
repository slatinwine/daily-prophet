# 📰 预言家日报 · The Daily Prophet

哈利波特魔法报纸风格的每日新闻页。**魔法世界即 AI 世界**。

- 在线阅读：https://slatinwine.github.io/daily-prophet/
- 备用（云端实时版）：https://magic-daily-prophet.app.workbuddy.host/?sharecode=DCAFWBM3RR

## 栏目（魔法世界观 ↔ 现实内容）

| 魔法栏目 | 内容 |
|---|---|
| 魔法世界头条 | AI 新闻（机器之心 · 量子位 · 雷峰网） |
| 麻瓜世界要闻 | 澎湃新闻热点 |
| 猫头鹰编辑部精选 | 澎湃编辑部精选 |
| 古灵阁财经版 | 华尔街见闻 |
| 魔文与符咒快讯 | IT之家 |
| 麻瓜生活工艺 | 少数派 |
| 奇闻异事司 | Solidot + B站热搜 |

## 工作原理

- `build.js`：零依赖 Node 脚本，抓取各新闻源并渲染成羊皮纸报纸 `index.html`（动态照片效果用纯 CSS 实现）
- 图片通过 [weserv](https://images.weserv.nl/) 公共代理加载，绕过图床防盗链
- `.github/workflows/rebuild.yml`：GitHub Actions 每小时自动重建并提交，Pages 随之更新

麻瓜免费订阅。
