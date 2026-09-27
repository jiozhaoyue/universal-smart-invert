# notes.md — 脚手架假红源（证据）

## 测量（同一台机器、同一时段，样本量如实标注）

| 指标 | 基线（改动前） | 本片改动后 |
| :--- | :--- | :--- |
| `test.js` 绿率 | **2/5**（3 红均被伪装成 `init() should not reject`） | **5/5** |
| `test-extension` 的 `classList` 类失败 | **3/6**（某批） | **0/6**（同批） |
| `test-browser` | 偶发红（当天 1/3） | **3/3**（33 场景全过） |

## H2 真实失败的两个证据链

1. **掩盖层的存在**：`test.js:970` 的 `.catch(() => assert.fail('init() should not reject'))`
   把 `.then()` 内的 `brightness === 0.77` 断言失败一并吞掉 → 报出的话与事实相反。
2. **真实原因**：临时在 `.catch` 里打印 `e.message` 后复现，取到
   `init() loads remote namespace into mirror after boot (regression: extension persistence)`，
   即 `st2.get('prefs').brightness !== 0.77` —— 因为 `chromeMock.__snapshot()` 在
   **分片写链**走完之前就被取走（块外是固定 `setTimeout(…, 40)`）。

## H1 的失败文案逐字对照

```
❌ 真扩展 E2E 失败: 页面内求值抛错: TypeError: Cannot read properties of null (reading 'classList')
```
与 `test-extension.js:334` 的 `document.documentElement.classList.contains(...)` 逐字对应；
导航刚提交、`<html>` 未创建的窗口期即可触发。

## 残留抖动（本片不清零，登记备查）

- `CDP 超时 (Runtime.enable)：目标可能已关闭` —— 基础设施
- `等待超时: 复访: 探针攒够 60 帧` —— rAF 停滞（AGENTS.md 已记该陷阱）
- 场景 8「内容脚本页卸载时的整份回写…」、站点重置「覆盖站点数应归零」—— 跨界面/防抖写竞态

## 流程如实记录

H1/H2 的代码改动**先于**本任务的 PRD/design/implement 落笔（用户在提问中直接授权「顺手修」）。
产物随后补齐，测量值取自改动前后各批实测，未做事后美化。
