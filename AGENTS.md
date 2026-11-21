# 日历足迹协作指南

## 接手时先做什么

1. 在仓库根目录查看 `git status --short` 和 `git log -5 --oneline`，确认已有改动和当前任务的发布范围。用户可能只要求本地修改，推送 `main` 会触发网页工作流。
2. 按任务选择文档。日常使用见 [使用说明](docs/使用说明.md)，构建发布和恢复见 [维护与备份](docs/维护与备份.md)，地点核验见 [地点维护流程](docs/地点维护流程.md)，视觉规范见 [配色清单](docs/配色清单.md)。
3. 先用合成数据与 `npm test` 验证。测试及调试日志不需要真实日历或地点库。

## 从零运行

- 使用 Node.js 22 或更新版本。桌面、单元测试和静态网页构建直接使用仓库内的代码和 `vendor/`，无需 `npm install`。Windows 的 `启动足迹.cmd` 和 `关闭足迹.cmd` 分别负责启动与停止。命令行也可运行 `npm start`，用 Ctrl+C 停止该前台进程。
- 桌面服务默认监听 `127.0.0.1:8787`。浏览器打开同一地址，`/api/health` 可检查服务是否在线。前端变更重载页面即可，`server/server.mjs` 及它导入的服务端模块变更后重启服务。
- 桌面读取项目根目录 `atlas-data/calendar.ics`、`place.csv`、`config.json`。在**全新测试副本**中可创建 `atlas-data/`，分别复制 `tests/fixtures/fixture.ics`、`tests/fixtures/place.csv`、`tests/fixtures/config.json` 为这三个文件名。现有私人文件不要覆盖。样例的日期可能不在默认近一年，点时间总览的「全部」查看。
- 无私人数据移动预览用 `node tools/build-mobile.mjs --data-less`，再运行 `node mobile/serve.mjs`，默认端口 8790。用同一组合成文件在导入框选择即可。构建会重建 `mobile/`，修改应落在源文件中。

## 代码入口

| 任务 | 入口 |
| --- | --- |
| 页面结构、响应式、抽屉、共享筛选 | `index.html`、`style.css`、`app.js`。先看 `startAtlas()`、`refresh()` |
| ICS 解析、重复事件、导入预览 | `lib/core.js`、`lib/calendar-import.js`、`server/calendar-store.mjs` |
| 筛选匹配、日期条件、柱图和计数 | `lib/filters.js`、`lib/timeline.js`、`lib/travel.js`，以及 `app.js` 的时间视图和统计渲染 |
| 地点定位、别名、分类、排除规则 | `lib/organize.js`、`lib/geo.js`、`lib/place-name.js`、`lib/place-categories.js`、`lib/data-formats.js`、`server/csv-store.mjs`、`server/config-store.mjs` |
| 瓦片、全国边界、上海图层 | `lib/basemaps.js`、`lib/city-boundary-data.mjs`、`data/`、`app.js`、`lib/annual-review.js` |
| 年度回顾、行程、分享图 | `lib/annual-review.js`、`lib/travel.js`、`lib/trip-share.js` 与 `app.js` 中对应对话框 |
| 主题、图标、应用版本 | `lib/appearance.js`、`style.css`、`index.html` 的 SVG 图标、`assets/icons/`、`server/app-version.mjs` |
| 桌面接口、移动构建和发布 | `server/server.mjs`、`server/atlas-data.mjs`、`server/atomic-file.mjs`、`tools/build-mobile.mjs`、`tools/mobile-data-provider.js`、`tools/mobile-readonly.js`、`.github/workflows/` |

> 分层约定：`lib/` 放浏览器与 Node 都能用的纯逻辑；`server/` 放桌面服务的文件读写与 HTTP；`tools/` 放离线数据源运维与构建；`index.html`、`app.js`、`style.css` 留在仓库根作为网页根目录（GitHub Pages 以此为 web root）。

## 容易回归的行为

- 桌面启动时读取文件，外部编辑后由用户点各自的刷新按钮。日历在偏好，地点与配置在各自文件标题旁。应用内保存后更新当前页面和更新时间。桌面日历「＋」先预览变更，确认后才替换活动文件。
- 时间总览修改标题上的连续日期范围，聚焦日期条件是独立的筛选。同类日期条件可多选，不同类型同时生效。事件搜索回车提交，可与日期条件叠加。清空事件筛选和重置日期条件有各自的入口。
- 时间统计按「筛选命中 / 日期条件 / 范围总数」显示，前两项只在相关条件生效时出现。柱图数字拥挤时优先保留总数和命中数，相同的日期条件数可省略。月柱等宽，剩余宽度放在年间或两侧。
- 宽屏按主内容的可用宽度切双栏，右栏事件独立滚动并按批加载。窄屏沿用页面滚动，事件标题和筛选区吸顶。时间柱图区分轻点、横拖与竖屏长按。地点地图默认收起，展开后绘制。
- 主地图上海与年度回顾上海各有自己的视野和开关。切换地点在线底图保留视野。回顾与行程分享应保留底图署名。

## 数据与交付

- `atlas-data/`、其中的备份、生成的报告、照片与查询缓存、密钥和签名文件留在本地。`data/` 是程序使用的公开地图数据。`tests/fixtures/` 是合成测试素材（含 `fixture.ics`、`place.csv`、`config.json`）。
- `config.json` 采用 v2 分组结构：`filters.blacklist`（事件/地点排除）、`emojis`（图标映射）、`photos.exclusions`（照片日常区域）。旧扁平结构仍可读，保存时自动升级为 v2。照片排除已并入这里，不再使用单独的 `photo-exclusions.json`。
- 从 Outlook 等客户端导出的 `calendar.ics` 含 Word 生成的 `X-ALT-DESC` HTML 冗余（与 `DESCRIPTION` 重复，约 97% 是样板）。导出替换后跑 `npm run clean:calendar -- --write`（或双击 `tools/清理日历.cmd`）清除：先备份到 `.backups/`，逐条比对事件不变才写入，通常缩约 30%。客户端每次导出会重新带回，属例行一步。
- 极少数事件正文是 Word 富文本，单条 `X-ALT-DESC` 约 38KB。可用 `tools/Outlook正文转纯文本.cmd`（`tools/outlook-plaintext.ps1`）在 Outlook 里批量改成纯文本：先用 RTF 体积筛候选，默认只预览，`-Apply` 才改；仅中文界面 Outlook、须 Windows PowerShell 5.1。改完可永久减小导出，零散小 HTML 仍靠上一条清理。
- 桌面使用本地 HTTP API。发布的移动包用 `--data-less`，手机导入缓存到当前应用的 IndexedDB。浏览器偏好在 localStorage。桌面更新文件后，手机需用新文件分别替换。
- 增加浏览器端模块或静态资源时，同时检查 `server/server.mjs` 的读取白名单和 `tools/build-mobile.mjs` 的复制与缓存清单。改 API 时对照移动数据提供器，桌面可编辑与手机导入模式的职责不同。
- 运行 `npm test`，再按改动范围验证桌面启动、手机导入、窄屏触控和宽屏滚动。涉及发布时检查暂存文件和 `--data-less` 产物，再按[维护与备份](docs/维护与备份.md)核对 Pages。
