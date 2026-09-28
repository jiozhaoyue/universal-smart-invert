# 执行计划 — Firefox 扩展支持

## 技术选型(全部为检索确认的现成方案,无自造轮子)

| 用途 | 工具 | 依据 |
|---|---|---|
| manifest 校验(门禁) | `web-ext lint`(底层 `addons-linter`) | Mozilla 官方,★3139,2026-09-28 仍在推 |
| Firefox 定位/启动/签名 | `web-ext` (`run` / `sign`) | 同上;签名即 AMO 发布通道 |
| Firefox 自动化驱动 | `geckodriver` | Mozilla 官方,★7476;W3C WebDriver 实现 |
| 装载扩展(自动化) | WebDriver 扩展命令 `POST /session/:id/moz/addon/install` | Firefox 专有命令,已被 Selenium / WebdriverIO 实现;**非自造** |
| 装载载荷 | `scripts/pack.js` 已有的确定性 ZIP | manifest 在 ZIP 根,正是该命令所需;零新增打包逻辑 |

**关键规格**(取自 WebdriverIO gecko 协议定义):

```
POST /session/:sessionId/moz/addon/install
{ "addon": "<base64 of the addon .zip>", "temporary": true }
→ 返回 addon id
```

**manifest 目标片段**(取自 MDN `browser_specific_settings`):

```json
"browser_specific_settings": {
  "gecko": {
    "id": "universal-smart-invert@dark-viewer",
    "data_collection_permissions": { "required": ["none"] },
    "strict_min_version": "140.0"
  },
  "gecko_android": { "strict_min_version": "142.0" }
}
```

- `required: ["none"]` 与项目「无自动网络遥测」原则天然一致(统计导出仅手动)
- `strict_min_version` **必须 ≥ 140** —— `data_collection_permissions` 由 Firefox 140 引入(Android 142),lint 会以 `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION` 拒绝更低值

**已否决**:手写 RDP 客户端(用户明确否决自造;web-ext/geckodriver 已覆盖全部需求)。

## 执行步骤

### A. manifest 生成 —— 完成

- [x] `scripts/build-extension.js`:新增 `browser_specific_settings.gecko`(`id` / `data_collection_permissions` / `strict_min_version`)与 `gecko_android`
- [x] 扩展**短名真源**:userscript header 新增 `// @name:ext  全网通用智能视频与图片反色 (Universal Smart Invert)`;`parseMetadata` 正则放宽为 `@([^\s]+)` 以支持带冒号的键
- [x] `extName` 改为「优先 `@name:ext`,回退 `clip(@name, 45)`」,并对超限显式 `fail`
- [x] `geckoId` 读自 `scripts/extension-key.json`(与 Chromium 公钥同处一个身份真源);缺失即 `fail`
- [x] `@version` 0.6.9 → 0.6.10(含 description 内的版本号与 `SCRIPT_VERSION` 常量,共 5 处)
- [x] 确认 `@name`(不带 `:ext`)未变
- [x] 验证:`node scripts/build-extension.js && node scripts/pack.js` ✅

### B. Firefox 门禁 —— 完成

- [x] `npx web-ext lint --source-dir=extension` → **errors 0**(warnings 从 7 降到 2,且 2 条均为已核实的假阳性)
- [ ] 把 lint 与 `test-firefox.js` 写入 AGENTS.md 门禁清单

### C. Firefox 功能级 E2E —— 完成

- [x] 获取 geckodriver 官方二进制 → `dev/tools/geckodriver.exe`(v0.37.1,2026-07-17);`.gitignore` 新增 `dev/tools/`
- [x] 新增 `test-firefox.js`(零依赖,`node` 内置 `fetch` 直连 W3C WebDriver 协议,与项目直连 CDP 同风格)
- [x] F1 断言返回 addon id == manifest 的 `gecko.id` ✅
- [x] F2/F3 断言浅色图反色、深色图不反色 ✅
- [x] F4 断言 `html.class` 含 `svi-img-invert-on` ✅
- [x] 存储风险改由官方 linter 判定(原定「后端名 == chrome-sync」不可行,已回填 PRD 并说明原因)
- [x] 缺 geckodriver / Firefox 时输出「未验证」并退出 0(与 `test-extension.js` 同约定,绝不伪装成通过)
- [x] 验证:`node test-firefox.js` → **4/4 通过**

### D. 三浏览器回归 —— 完成(全绿)

- [x] `node --check universal-smart-invert.user.js` ✅
- [x] `node test.js` → exit 0 ✅
- [x] `node test-browser.js` → exit 0,34 场景全过 ✅
- [x] Chrome 153 `test-extension.js` → 全绿,ID = `laldjilafbegbdkjoaamjpcljjmanohe`(未变)✅
- [x] Edge 154 `test-extension.js` → 全绿,同一 ID ✅

### E. 签名与发布前置 —— 阻塞(缺凭据)

- [ ] `npx web-ext sign --source-dir=extension --api-key <> --api-secret <>`
- [x] 凭据缺失已显式记录为**唯一阻塞项**(PRD Open Questions)

### F. 收尾 —— 进行中

- [ ] 沉淀 spec:`.trellis/spec/frontend/` 跨浏览器扩展契约(单份 manifest 双引擎规则 + Firefox 身份字段 + 门禁命令)
- [ ] 更新 AGENTS.md 的门禁命令清单
- [ ] 提交并推送 `origin main`

## 实测记录(踩到的坑,供 spec 沉淀)

1. **陈旧 zip 陷阱**:`test-firefox.js` 起初只在 zip 不存在时才打包。版本号未变时会复用**上一版 manifest** 打出的 zip,而装载载荷正是这个 zip —— Firefox 于是分配随机 `@temporary-addon` id,F1 直接失败,且报错信息看起来像"身份字段不被采纳",极易误判为产品缺陷。已改为**每次重跑 `pack.js`**。
2. **`grep -c $'\r'` 在 Git Bash 下不可用**:`$'\r'` 被展开成空模式,于是"匹配所有行",把纯 LF 文件全部误报成 CRLF(实测 `CR=0` 的文件被报成"17292/17292 行 CRLF")。判定行尾必须用 `node` 数字节(`s.match(/\r/g)`),不要用 grep。AGENTS.md 里"工作区是 CRLF"的描述在当前检出上**不成立**。
3. **装载 id 是身份是否被采纳的唯一证据**:只断言"扩展装上了"会漏掉随机 id —— 那正是 storage.sync 在 Firefox 不稳的根因。

## 回滚点

- 步骤 A 失败:`git checkout -- scripts/build-extension.js scripts/extension-key.json extension/ universal-smart-invert.user.js` 即恢复(产物可重建)
- 步骤 B/C 失败:门禁不并入 AGENTS.md,任务降级为「仅记录兼容性结论」
- 步骤 E 失败:不影响 A–D 的产物正确性;Firefox 仍可经 `about:debugging` 临时装载

## 不可逆点(需谨慎)

- `gecko.id` 一旦向 AMO 首次签名即被占用,后续更换等价于重新发布 —— 本任务已定 `universal-smart-invert@dark-viewer`,不再更改
