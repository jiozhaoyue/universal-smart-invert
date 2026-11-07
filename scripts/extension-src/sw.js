// 09-29 (task 09-29-viewer-plugin-adapt R3.3): 扩展形态的**跨域取字节**通道。
//
// 为什么需要后台脚本: MV3 下**内容脚本的 fetch 受页面 CORS 限制**（不能再像 MV2 那样凭
// host 权限跨域），于是「跨域且源站不发 CORS」的原图拿不到字节 → `gmFetchBlob` 失败 →
// 那张图永远不反色。后台脚本/SW 拥有 `host_permissions` 授予的跨域能力，是 MV3 下唯一
// 合法的越权取图通道。实测背景见
// `.trellis/tasks/09-29-viewer-plugin-adapt/research/01-overlay-probe.md`。
//
// **唯一用途 = 取媒体字节**，不是通用代理：
//   · 只接受 http/https
//   · 只回字节（不回状态、不做重定向改写）
//   · 带体积门（超限即拒，交由调用方回落既有路径）
//   · 不写任何存储、不记日志、不发起任何非请求方指定的网络动作
// 同一份文件在 Chromium 里以 service worker 运行，在 Firefox 里以背景脚本运行
// （manifest 里 `service_worker` 与 `scripts` 两键并存，各引擎忽略不认识的那个）。

var SVI_MAX_BYTES = 4 * 1024 * 1024;

// **必须走 base64 字符串传输**: `Uint8Array` 过 `chrome.runtime` 消息会被 JSON 序列化成
// 普通对象 ({"0":137,...}), 到内容脚本侧 `new Blob([obj])` 只有 15 字节 ("[object Object]")
// → 解码必失败。实测见该任务 research/。字符串可无损过 JSON。
function toBase64(u8) {
  var out = '';
  var CH = 0x8000;   // 分块, 避免 apply 的参数个数上限
  for (var i = 0; i < u8.length; i += CH) {
    out += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return btoa(out);
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'svi-fetch-bytes') return false;
  // 只接受本扩展自己上下文发来的请求（页面无法触达：manifest 无 externally_connectable）
  try {
    if (sender && sender.id && sender.id !== chrome.runtime.id) {
      sendResponse({ ok: false, why: 'sender' });
      return false;
    }
  } catch (e) { /* 引擎间 sender 形状差异: 放行 */ }

  var url = String(msg.url || '');
  if (!/^https?:\/\//i.test(url)) {
    sendResponse({ ok: false, why: 'scheme' });
    return false;
  }

  fetch(url, { credentials: 'omit', redirect: 'follow' })
    .then(function (res) {
      if (!res.ok) return { ok: false, why: 'http' + res.status };
      return res.arrayBuffer().then(function (buf) {
        if (buf.byteLength > SVI_MAX_BYTES) {
          return { ok: false, why: 'too-large', size: buf.byteLength };
        }
        return {
          ok: true,
          size: buf.byteLength,
          type: res.headers.get('content-type') || '',
          b64: toBase64(new Uint8Array(buf)),
        };
      });
    })
    .catch(function (err) {
      return { ok: false, why: 'network', detail: String((err && err.message) || err) };
    })
    .then(function (out) {
      try { sendResponse(out); } catch (e) { /* 通道已关闭 */ }
    });

  return true; // 异步 sendResponse
});
