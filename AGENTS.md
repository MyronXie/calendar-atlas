# 日历足迹协作指南

## 接手时先做什么

1. 在仓库根目录查看 `git status --short` 和 `git log -5 --oneline`，确认已有改动和当前任务的发布范围。用户可能只要求本地修改，推送 `main` 会触发网页和 APK 工作流。
2. 按任务选择文档。日常使用见 [使用说明](使用说明.md)，构建发布和恢复见 [维护与备份](维护与备份.md)，地点核验见 [地点维护流程](reports/地点维护流程.md)，视觉规范见 [配色清单](配色清单.md)。
3. 先用合成数据与 `npm test` 验证。测试及调试日志不需要真实日历或地点库。

## 从零运行

- 使用 Node.js 22 或更新版本。桌面、单元测试和静态网页构建直接使用仓库内的代码和 `vendor/`，无需 `npm install`。Windows 的 `启动足迹.cmd` 和 `关闭足迹.cmd` 分别负责启动与停止。命令行也可运行 `npm start`，用 Ctrl+C 停止该前台进程。
- 桌面服务默认监听 `127.0.0.1:8787`。浏览器打开同一地址，`/api/health` 可检查服务是否在线。前端变更重载页面即可，`server.mjs` 及它导入的服务端模块变更后重启服务。
- 桌面读取项目根目录 `atlas-data/calendar.ics`、`place.csv`、`config.json`。在**全新测试副本**中可创建 `atlas-data/`，分别复制 `tests/fixture.ics`、`tests/fixtures/place.csv`、`tests/fixtures/config.json` 为这三个文件名。现有私人文件不要覆盖。样例的日期可能不在默认近一年，点时间总览的「全部」查看。
- 无私人数据移动预览用 `node tools/build-mobile.mjs --data-less`，再运行 `node mobile/serve.mjs`，默认端口 8790。用同一组合成文件在导入框选择即可。构建会重建 `mobile/`，修改应落在源文件中。

## 代码入口

| 任务 | 入口 |
| --- | --- |
| 页面结构、响应式、抽屉、共享筛选 | `index.html`、`style.css`、`app.js`。先看 `startAtlas()`、`refresh()` |
| ICS 解析、重复事件、导入预览 | `core.js`、`calendar-import.js`、`calendar-store.mjs` |
| 筛选匹配、日期条件、柱图和计数 | `filters.js`、`timeline.js`、`travel.js`，以及 `app.js` 的时间视图和统计渲染 |
| 地点定位、别名、分类、排除规则 | `organize.js`、`place-categories.js`、`data-formats.js`、`csv-store.mjs`、`config-store.mjs` |
| 瓦片、全国边界、上海图层 | `basemaps.js`、`city-boundary-data.mjs`、`data/`、`app.js`、`annual-review.js` |
| 年度回顾、行程、分享图 | `annual-review.js`、`travel.js`、`trip-share.js` 与 `app.js` 中对应对话框 |
| 主题、图标、应用版本 | `appearance.js`、`style.css`、`index.html` 的 SVG 图标、`assets/icons/`、`app-version.mjs` |
| 桌面接口、移动构建和发布 | `server.mjs`、`atlas-data.mjs`、`tools/build-mobile.mjs`、`tools/mobile-data-provider.js`、`tools/mobile-readonly.js`、`.github/workflows/` |

## 容易回归的行为

- 桌面启动时读取文件，外部编辑后由用户点各自的刷新按钮。日历在偏好，地点与配置在各自文件标题旁。应用内保存后更新当前页面和更新时间。桌面日历「＋」先预览变更，确认后才替换活动文件。
- 时间总览修改标题上的连续日期范围，聚焦日期条件是独立的筛选。同类日期条件可多选，不同类型同时生效。事件搜索回车提交，可与日期条件叠加。清空事件筛选和重置日期条件有各自的入口。
- 时间统计按「筛选命中 / 日期条件 / 范围总数」显示，前两项只在相关条件生效时出现。柱图数字拥挤时优先保留总数和命中数，相同的日期条件数可省略。月柱等宽，剩余宽度放在年间或两侧。
- 宽屏按主内容的可用宽度切双栏，右栏事件独立滚动并按批加载。窄屏沿用页面滚动，事件标题和筛选区吸顶。时间柱图区分轻点、横拖与竖屏长按。地点地图默认收起，展开后绘制。
- 主地图上海与年度回顾上海各有自己的视野和开关。切换地点在线底图保留视野。回顾与行程分享应保留底图署名。

## 数据与交付

- `atlas-data/`、其中的备份、生成的报告、照片与查询缓存、密钥和签名文件留在本地。`data/` 是程序使用的公开地图数据。`tests/fixtures/` 和 `tests/fixture.ics` 是合成测试素材。
- 桌面使用本地 HTTP API。发布的移动包用 `--data-less`，手机导入缓存到当前应用的 IndexedDB。浏览器偏好在 localStorage。桌面更新文件后，手机需用新文件分别替换。
- 增加浏览器端模块或静态资源时，同时检查 `server.mjs` 的读取白名单和 `tools/build-mobile.mjs` 的复制与缓存清单。改 API 时对照移动数据提供器，桌面可编辑与手机导入模式的职责不同。
- 运行 `npm test`，再按改动范围验证桌面启动、手机导入、窄屏触控和宽屏滚动。涉及发布时检查暂存文件和 `--data-less` 产物，再按[维护与备份](维护与备份.md)核对 Pages 或 APK。
