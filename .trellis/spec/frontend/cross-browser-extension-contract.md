# 跨浏览器扩展契约(单份 manifest,双引擎)

> 建立于 2026-09-28(firefox-support 任务)。描述扩展产物同时服务 Chromium 系(Chrome/Edge)
> 与 Firefox 系的**硬契约**。改动 `scripts/build-extension.js` 的 manifest 生成段前必读。

---

## 1. 单份产物,两个引擎

`extension/manifest.json` 由 `scripts/build-extension.js` 生成,**只有一份**,同时服务两个引擎:

| 字段 | Chromium 系 | Firefox 系 |
|---|---|---|
| `key`(公钥 → 扩展 ID) | 生效 | **忽略** |
| `browser_specific_settings` | **完全忽略** | 生效 |

因此:两个引擎各自的身份字段可以共存于一份 manifest,**不要**为 Firefox 分叉产物目录。

---

## 2. 身份有两个真源,互不影响

- **Chromium 扩展 ID** = `manifest.key` 推导 → `scripts/extension-key.json` 的 `key` 字段。
  私钥 `crx-private-key.pem` 永不入库。当前 ID:`laldjilafbegbdkjoaamjpcljjmanohe`。
- **Firefox add-on ID** = `browser_specific_settings.gecko.id` → 同一文件的 `geckoId` 字段。
  当前值:`universal-smart-invert@dark-viewer`。

两者**都**放在 `scripts/extension-key.json`(扩展身份的唯一真源)。`geckoId` 缺失时构建必须 `fail`,
不得静默降级 —— 缺它会让 Firefox 分配随机临时 id,并连带 `storage.sync` 不稳。

**`gecko.id` 不可逆**:首次向 AMO 签名后该 id 即被占用,更换等价于重新发布。

---

## 3. 三个字段的硬约束(改错即被 linter 拒)

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

- `data_collection_permissions` 自 **2025-11-03** 起为 AMO 新提交的**强制**字段。
  本扩展无任何自动网络遥测(统计导出仅手动),故恒为 `{"required": ["none"]}`。
- `strict_min_version` **必须 ≥ 140** —— 该字段由 Firefox 140 引入(Android 142)。
  设更低值会触发 `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION`。
- 不声明 `gecko_android` 时,其门槛回退到 `gecko.strict_min_version` 并持续告警;
  声明为 142 才是准确的。

---

## 4. 扩展显示名的唯一真源是 `@name:ext`

Firefox 的 `manifest.name` 上限 **45 字符**,Chrome 是 75 —— 取更严者(45),故:

- header 里的 `// @name:ext` 是扩展显示名的**唯一真源**;
- 构建取 `meta['name:ext']`,回退 `clip(meta.name, 45)`,超过 45 直接 `fail`;
- **`@name` 本身不受影响**(脚本管理器里的显示名保持不变)。

`parseMetadata` 的正则放宽为 `@([^\s]+)` 以支持带冒号的键(`@name:ext` / `@name:zh-CN` / `@description:en`)。
`@name` 与 `@name:xx` 是彼此独立的键;`first occurrence wins` 只作用于同键重复。

---

## 5. 装载通道矩阵(测试用,三者互不通用)

| 引擎 | 通道 | 为什么不能换 |
|---|---|---|
| Chrome / Edge | CDP `Extensions.loadUnpacked` | 137+ 已忽略 `--load-extension`;该命令只对带 `--remote-debugging-pipe` + `--enable-unsafe-extension-debugging` 的实例有效 → `test-extension.js` |
| Firefox | WebDriver `POST /session/:id/moz/addon/install`(Mozilla 官方扩展命令) | Firefox 不实现 `Extensions.loadUnpacked` → `test-firefox.js` |

**Firefox 装载载荷是扩展 zip 的 base64**,不是目录路径 —— 直接复用 `scripts/pack.js` 的确定性产物,无需新打包逻辑。

**永远不要**手写 RDP 客户端或用 web-ext 的内部机制做断言:`web-ext`(lint/run/sign)与 `geckodriver`(WebDriver)已覆盖全部需求。

---

## 6. 门禁命令(全绿才可提交)

```bash
node --check universal-smart-invert.user.js
node test.js
node test-browser.js
SVI_CHROME_PATH=<chrome> node test-extension.js     # 需 Chrome;CDP 9333 + HTTP 8791
SVI_CHROME_PATH=<msedge> node test-extension.js     # 需 Edge;同上
node test-firefox.js                               # 需 geckodriver + Firefox
npx web-ext lint --source-dir=extension            # 必须 0 errors
node scripts/build-extension.js && node scripts/pack.js
```

`test-firefox.js` 与 `test-extension.js` 同约定:**缺依赖时输出「未验证」并退出 0,绝不伪装成通过**。
geckodriver 放 `dev/tools/`(gitignored),脚本自动探测,也可用 `SVI_GECKODRIVER` / `SVI_FIREFOX` 指定。

---

## 7. 两个已踩过的坑(不要重犯)

1. **陈旧 zip**:`test-firefox.js` 必须**每次重跑 `pack.js`**。若只在 zip 不存在时打包,版本号未变就会
   复用上一版 manifest 打出的 zip,导致 Firefox 分配随机 `@temporary-addon` id,报错却看起来像"身份字段不被采纳"。
2. **判定行尾不要用 `grep -c $'\r'`**:在 Git Bash 下 `$'\r'` 展开为空模式,"匹配所有行",
   会把纯 LF 文件全部误报为 CRLF。用 `node` 数字节:`s.match(/\r/g)`。

## 8. 后台脚本与跨域取字节(2026-09 新增)

**为什么需要**:MV3 下内容脚本的 `fetch` 受页面 CORS 限制(MV2 那种凭 host 权限跨域的做法已失效),
"跨域且源站不发 CORS"的图片拿不到字节 → 像素回退链整条失效。后台脚本 / SW 有 `host_permissions`
授予的跨域能力,是 MV3 下唯一合法的越权取图通道。

**契约**:

1. manifest 里 `background` **两键并存** —— `{ service_worker, scripts }`:Chromium 用前者,
   Firefox MV3 用后者,各引擎忽略不认识的那个键。**绝不为两引擎分叉产物目录**。
   `web-ext lint` 会报一条 `BACKGROUND_SERVICE_WORKER_IGNORED`(警告,不是错误)—— 那是**预期行为**,
   `extesy/hoverzoom` 的真实 manifest 用的也是这份双键写法。
2. `host_permissions: ["<all_urls>"]`。Chrome 的"读取与更改所有网站数据"警告本就由
   `content_scripts.matches` 的 `<all_urls>` 派生,故此键**通常不新增警告类别** ——
   本条为**推导,未实测**;要实证请开 `chrome://extensions` 详情页看权限清单。
3. **跨上下文传二进制一律走 base64 字符串**。`Uint8Array` 过 `chrome.runtime` 消息会被
   JSON 序列化成普通对象(`ctor=Object`、`len=undefined`),内容脚本侧 `new Blob([obj])`
   只得到 **15 字节**(`"[object Object]"`)→ 解码必失败;而且失败会被调用方的 catch 吞掉,
   **伪装成"跨域取不到"**。实测 `blob.size=15`。字段名固定 `b64`,
   以 `typeof res.b64 !== 'string'` 作失败判据(不要再检查 `bytes`)。
   与引擎无关,Chromium / Firefox 都会 JSON 化,故**不得**改用"传字节数组"的变体。
4. 后台脚本**只做一件事**:取媒体字节。限 http/https、带体积门(4MB)、只服务本扩展上下文
   (manifest 无 `externally_connectable`,页面触达不到)。**不得**演变成通用代理。
