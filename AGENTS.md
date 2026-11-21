# 日历足迹协作指南

## 接手时先做什么

1. 在仓库根目录查看 `git status --short --branch` 和 `git log -5 --oneline`，确认基线、已有改动与本轮交付范围。推送 `main` 会触发 Pages 发布工作流。
2. 按任务选择文档。日常使用见 [使用说明](docs/使用说明.md)，验证、交接、构建发布和恢复见 [维护与备份](docs/维护与备份.md)，地点核验见 [地点维护流程](docs/地点维护流程.md)，视觉规范见 [配色清单](docs/配色清单.md)，模块入口见 [工程文件说明](docs/工程文件说明.md)。
3. 先用合成数据与 `npm test` 验证。测试及调试日志不需要真实日历或地点库。

## 从零运行

- 使用 Node.js 22 或更新版本。桌面、单元测试和静态网页构建直接使用仓库内的代码和 `vendor/`，无需 `npm install`。Windows 的 `启动足迹.cmd` 和 `关闭足迹.cmd` 分别负责启动与停止。命令行也可运行 `npm start`，用 Ctrl+C 停止该前台进程。
- 桌面服务默认监听 `127.0.0.1:8787`。浏览器打开同一地址，`/api/health` 可检查服务是否在线。前端变更重载页面即可，`server/server.mjs` 及它导入的服务端模块变更后重启服务。
- 桌面读取项目根目录 `atlas-data/calendar.ics`、`place.csv`、`config.json`。在**全新测试副本**中可创建 `atlas-data/`，分别复制 `tests/fixtures/fixture.ics`、`tests/fixtures/place.csv`、`tests/fixtures/config.json` 为这三个文件名。保留现有私人文件。如果样例超出了默认的近一年范围，展开「时间」后点总览的「全部」。
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

## 当前行为与更新约定

### 启动与筛选

- 启动先读取日历、地点和配置并显示事件。时间、地点和排行每次启动时收起，展开后才计算相应内容。全国边界、城市索引和详细图层按需读取。移动包也把这些资源放入按需缓存清单。入口见 `startAtlas()`、`refreshVisiblePanels()` 和 `loadChina()`。
- ICS 解析按 UID 将重复事件例外关联到所属系列。`parseCalendar()` 显式接管例外关联，避免 ICAL 为每个事件扫描整个日历。改解析时用两个同一时刻发生的独立重复系列验证改期和取消的归属。
- 事件搜索即时更新列表，并合并刷新当前打开的统计、排行和地图。回车提交条件，同一地点的别名在预览和提交时都解析到主名称。标题栏的宽度测量发生在尺寸、标题占位或模式变化时。入口见 `refresh()`、`createEventMatcher()` 和 `scheduleSectionTools()`。
- 连续时间范围显示在「时间」标题里。聚焦日期和事件筛选在搜索框下方共用一行标签，空间不足时横向滚动。清空事件筛选保留时间范围和聚焦日期。聚焦日期可逐项移除或从时间工具栏重置。同类日期条件可多选，不同类型同时生效。
- 时间统计按「筛选命中 / 日期条件 / 范围总数」显示，前两项仅在对应条件生效时出现。柱图数字拥挤时优先保留总数和命中数，相同的日期条件数可省略。月柱等宽，剩余宽度放在年间或两侧。

### 布局与交互

- 工具栏左侧为排行和应用名称，中间为行程与回顾，右侧为设置。复用 `style.css` 中 36 px 常规、32 px 紧凑与 44 px 主要触控区的尺寸变量。主色用于选中与主操作，对比色用于筛选命中。保留默认字体与桌面字号偏好，日间和夜间都要检查。
- 双栏根据主内容宽度切换，各栏最小宽度 440 px。分割条两侧留白对齐，右栏独立滚动，单栏切回双栏时恢复平分。事件布局随栏宽调整。窄栏左侧日期和时刻分行，右侧依次排事件、地点、人物和命中关键词的备注。单栏保留页内吸顶和滚动。
- 时间标题栏按日期旁的剩余宽度，先隐藏操作文字，再简写「总览／聚焦」，最后收窄时间单位。简写后的模式按钮宽度固定。柱图区分轻点、横拖和竖屏长按。柱图、地图底部拖动手柄与偏好双向同步，所选高度刷新后保留。
- 点击排行左侧的排名数字可移入「不参与排名」，随后点击隐藏图标恢复。点击名称仍用于筛选。备注筛选和显示共同跳过 `Partner:` 与 `Place:` 行。
- 移动端次要按钮统一 `--control-height`（36 px），排行、设置、重置、地点／人物、清空、抽屉关闭键与时间栏操作等高。矮屏（如手机横屏，`max-height:540px`）主标题栏改为不吸顶，随页面滚动收起、回到顶部再出现；此时行程／回顾简写为行程／回顾，应用名隐藏，并按打开的抽屉只保留排行或设置其中一个文字。年月与总览／聚焦切换改为圆角矩形按钮。移动版日期输入在 iOS Safari 下用 flex 做水平与垂直居中，打开时间范围时不自动弹出起始日期选择器。

### 地图、导出和文件

- 主地图容器尺寸变化后通知 Leaflet 重新计算瓦片覆盖。放大地图时单点和 Emoji 变大，缩小时同步变小。聚合点沿用主题配色的双层圆圈。主地图上海与年度回顾上海各有自己的视野和开关，切换地点在线底图保留视野。
- 行程右侧可暂时隐藏已定位的地点，总览和分日共用选择。隐藏地点也从导出地点清单、点位和路线中移除。行程预览和下载共用同一张画布，底图署名随供应商变化。年度回顾的「导出」直接下载 PNG。
- 桌面外部编辑文件后由用户点对应刷新按钮。日历入口在偏好，地点和配置入口在各自文件标题旁。应用内保存会更新页面和更新时间。桌面日历「＋」先预览变更，确认后替换活动文件。

## 数据与交付

- `atlas-data/`、其中的备份、生成的报告、照片与查询缓存、密钥和签名文件留在本地。`data/` 是程序使用的公开地图数据。`tests/fixtures/` 是合成测试素材（含 `fixture.ics`、`place.csv`、`config.json`）。
- `config.json` 采用 v2 分组结构：`filters.blacklist`（事件/地点排除）、`emojis`（图标映射）、`photos.exclusions`（照片日常区域）。旧扁平结构仍可读，保存时自动升级为 v2。照片排除已并入这里，不再使用单独的 `photo-exclusions.json`。
- 地点显示与计数以 `place.csv` 的 `location` 为准：日历里通过 `aliases` 命中的写法，读入应用后统一显示为对应 `location`，避免同一地点分开计数；搜索时输入别名也会先映射到 `location`。新增/编辑地点时 `address` 必须写全称（省/自治区/直辖市 + 市/州 + 区/县 + 道路/门牌）；境外用英文地址。
- 从 Outlook 等客户端导出的 `calendar.ics` 含 Word 生成的 `X-ALT-DESC` HTML 冗余（与 `DESCRIPTION` 重复，约 97% 是样板）。导出替换后跑 `npm run clean:calendar -- --write`（或双击 `tools/清理日历.cmd`）清除：先备份到 `.backups/`，逐条比对事件不变才写入，通常缩约 30%。客户端每次导出会重新带回，属例行一步。
- 极少数事件正文是 Word 富文本，单条 `X-ALT-DESC` 约 38KB。可用 `tools/Outlook正文转纯文本.cmd`（`tools/outlook-plaintext.ps1`）在 Outlook 里批量改成纯文本：先用 RTF 体积筛候选，默认只预览，`-Apply` 才改；仅中文界面 Outlook、须 Windows PowerShell 5.1。改完可永久减小导出，零散小 HTML 仍靠上一条清理。
- 桌面使用本地 HTTP API。发布的移动包用 `--data-less`，手机导入缓存到当前应用的 IndexedDB。浏览器偏好在 localStorage。桌面更新文件后，手机需用新文件分别替换。
- 增加浏览器端模块或静态资源时，同时检查 `server/server.mjs` 的读取白名单和 `tools/build-mobile.mjs` 的复制与缓存清单。改 API 时对照移动数据提供器，桌面可编辑与手机导入模式的职责不同。
- 运行 `npm test`，再按改动范围验证桌面启动、手机导入、窄屏触控和宽屏滚动。涉及发布时检查暂存文件和 `--data-less` 产物，再按[维护与备份](docs/维护与备份.md)核对 Pages。
