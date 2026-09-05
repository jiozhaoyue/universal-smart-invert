// ==UserScript==
// @name         [DEV] 全网通用智能视频与图片反色 (本地热载调试)
// @name:zh-CN   [DEV] 全网通用智能视频与图片反色 (本地热载调试)
// @name:en      [DEV] Universal Smart Video & Image Invert (Local Dev Loader)
// @namespace    https://github.com/jiozhaoyue/universal-smart-invert
// @version      999.0.0-dev
// @description  本地秒级热加载调试专用脚本。通过 file:// 协议直接读取本地硬盘文件，IDE 保存代码后直接刷新网页即刻生效！
// @author       jiozhaoyue
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM.xmlHttpRequest
// @connect      *
// @run-at       document-end
// @require      file:///YOUR_LOCAL_PATH/universal-smart-invert/universal-smart-invert.user.js
// ==/UserScript==

/**
 * 💡 本地热加载使用指南：
 * 
 * 1. 在 Chrome / Edge 扩展管理页面（chrome://extensions 或 edge://extensions）中：
 *    - 找到 Tampermonkey（或 ScriptCat）插件
 *    - 点击「详细信息 / Details」
 *    - 开启「允许访问文件网址」(Allow access to file URLs) 开关。
 * 
 * 2. 修改上方 @require 的路径为您本机上 universal-smart-invert.user.js 的真实绝对路径：
 *    - Windows 格式示例: file://D:/Projects/universal-smart-invert/universal-smart-invert.user.js
 *    - macOS / Linux 格式示例: file:///Users/username/Projects/universal-smart-invert/universal-smart-invert.user.js
 * 
 * 3. 打开油猴面板 ->「添加新脚本」-> 将本文件（dev-loader.user.js）全文复制粘贴进去并保存。
 * 
 * 4. 停用油猴中原先安装的线上生产版脚本，仅保留此 [DEV] 脚本。
 * 
 * 5. 之后在本地编辑器修改 universal-smart-invert.user.js 并保存，
 *    浏览器直接按 F5 刷新网页即可立刻生效最新代码，无需每次提交或重新复制！
 */
