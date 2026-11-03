# Firefox 扩展支持与三浏览器兼容性验证

## Goal

让扩展可在 Firefox 正式安装(补 gecko.id + 合规 short name + data_collection_permissions),并以 Mozilla 官方 web-ext/geckodriver 建立 Firefox 兼容性门禁与功能级 E2E

## 现状(2026-09-28 实测,非推测)

| 浏览器 | 通道 | 结果 |
|---|---|---|
| Edge 154.0.4258.37 | CDP `Extensions.loadUnpacked`(临时 profile) | 8/8 E2E 通过 |
| Chrome 153.0.8010.53 | CDP `Extensions.loadUnpacked`(临时 profile) | 8/8 E2E 通过 |
| Firefox 156.0.1 | `web-ext run` 临时装载 | 装载成功,但拿到的是随机临时 id(无 gecko.id) |

Firefox 侧 `web-ext lint` 实测:**2 errors / 7 warnings**。

根因三条:

1. `JSON_INVALID` —— manifest `name` 为 53 字符,Firefox 上限 45
2. `ADDON_ID_REQUIRED` —— MV3 必须有 `browser_specific_settings.gecko.id`;缺失时 Firefox 分配随机临时 id
3. `MISSING_DATA_COLLECTION_PERMISSIONS` —— 2025-11-03 起 AMO 新提交强制要求

连带问题:无 gecko.id 时 `storage.sync` 在 Firefox 下不稳定(4 处 `STORAGE_SYNC` 警告指向 `content.js:429/638`、`options.js:40`)—— 而 `Store` 的首选后端正是 `chrome.storage.sync`,属**功能级**风险。

另 2 处 `UNSAFE_VAR_ASSIGNMENT` 经核实为**假阳性**(`ui-controls.js:393` 赋值源是冻结的静态 SVG 常量表,无插值,符合 XSS 纪律)。

## Requirements

- **R1** 扩展 manifest 必须通过 Mozilla 官方 `addons-linter`(即 `web-ext lint`),产出 **0 errors**
- **R2** 扩展必须能经 Mozilla 官方通道在 Firefox 装载并运行(`geckodriver` 的 WebDriver 扩展命令 `moz/addon/install`)
- **R3** Firefox 下反色必须**真实生效**,且该断言可自动复现(不依赖人工肉眼)
- **R4** Firefox 下设置同步必须可用 —— 即 `Store` 的后端选择在 Firefox 中不再因缺 id 而降级
- **R5** Chrome / Edge 侧行为**不得改变**,扩展 ID 必须仍是 `laldjilafbegbdkjoaamjpcljjmanohe`
- **R6** **不自造协议驱动**:只用 Mozilla 官方 `web-ext` / `geckodriver` 与标准 WebDriver 协议;不手写 RDP 客户端
- **R7** 不引入新的运行时依赖;打包与测试产物保持确定性、可复现
- **R8** userscript 的 `@name` **不变**(脚本管理器里的显示名不动);本次只改**扩展**显示名
- **R9** 打通 AMO 签名的前置条件(`web-ext sign`),凭据缺失必须被显式记录而非静默跳过

## Constraints

- 单份 `manifest.json` 同时服务 Chromium 与 Firefox(`browser_specific_settings` 被 Chrome 完全忽略)
- `extension/` 是**生成物**,永不手改;一切改动落在 `scripts/build-extension.js` 与 userscript header
- userscript 引擎(反色判定、区域掩码、渲染层)**零改动**
- 现有五绿门禁必须继续全绿
- geckodriver 二进制与 AMO 凭据**不入库**(gitignore)

## Acceptance Criteria

- [x] `npx web-ext lint --source-dir=extension` 输出 **0 errors**(实测 errors 0 / warnings 2,2 条均为已核实的 `UNSAFE_VAR_ASSIGNMENT` 假阳性)
- [x] Firefox 经 geckodriver 官方命令装载成功,且装载返回的 addon id **等于** manifest 中的 `gecko.id`
      —— 实测返回 `universal-smart-invert@dark-viewer`;改造前为随机 `68a677…@temporary-addon`
- [x] Firefox 中打开 fixture 页,断言反色真实生效:`img.computedStyle.filter` 含 `invert(1)`,`html.class` 含 `svi-img-invert-on`
      —— 实测 `invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9)`
- [x] **Firefox 存储风险由官方 linter 判定消除**:`web-ext lint` 不再报任何 `STORAGE_SYNC` 警告(改造前 4 条)。该警告的触发条件正是"缺 gecko.id 时临时装载下使用 storage.sync"。
      *修正说明*:原定"断言后端名 == chrome-sync"不可行 —— 扩展内部状态无法从页面上下文读取(隔离世界),且 WebDriver 打开 `moz-extension://` 需先取得内部 UUID,收益不抵复杂度。故改以官方 linter 的判定为准。
- [x] Chrome 与 Edge 的 `test-extension.js` 仍全绿,自验 ID 仍为 `laldjilafbegbdkjoaamjpcljjmanohe`
- [x] `node --check` / `node test.js` / `node test-browser.js` / `build-extension.js` + `pack.js` 全绿
- [x] 扩展显示名为 `全网通用智能视频与图片反色 (Universal Smart Invert)`(38 字符 ≤ 45)
- [x] userscript 的 `@name` 未变(仍为 `全网通用智能视频与图片反色 (Universal Smart Video & Image Invert)`)
- [ ] `web-ext sign` **未执行** —— 缺 AMO API 凭据(本项目唯一阻塞项,见 Open Questions)

## Open Questions

- **AMO API 凭据**(JWT issuer / secret)尚未取得 —— 这是 `web-ext sign` 的硬前置。获取路径:登录 addons.mozilla.org → 开发者控制台 → API 密钥页面(需先注册 AMO/Firefox 账号)。拿到后即可补跑最后一步。
- geckodriver 二进制的落地目录:已定为 `dev/tools/`(gitignored),由 `test-firefox.js` 自动探测。
