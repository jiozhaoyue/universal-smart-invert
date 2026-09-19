// Focused: why doesn't dynamic theme (bgReplace) apply on the real mail.163.com?
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path'); const http = require('http'); const os = require('os');
const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9250;
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-163-');
const chrome = spawn(CHROME, ['--remote-debugging-port='+CDP_PORT, '--user-data-dir='+userDataDir, '--headless=new','--disable-gpu','--no-first-run','--enable-unsafe-swiftshader', ...(process.env.HTTPS_PROXY?['--proxy-server='+process.env.HTTPS_PROXY]:[]), '--window-size=1440,900', 'about:blank'], {stdio:'ignore'});
function get(p){return new Promise((res,rej)=>{http.get({host:'127.0.0.1',port:CDP_PORT,path:p},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{res(JSON.parse(b))}catch(e){rej(e)}})}).on('error',rej);});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const SRC = fs.readFileSync(path.join(__dirname,'..','universal-smart-invert.user.js'),'utf8').replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==/,'').trim();
(async()=>{
  let t=null; for(let i=0;i<30;i++){try{t=await get('/json/list');break}catch(e){} await sleep(300);}
  const page=t.find(x=>x.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  let id=0; const pend=new Map();
  ws.onmessage=m=>{const g=JSON.parse(m.data); if(g.id&&pend.has(g.id)){pend.get(g.id)(g);pend.delete(g.id);}};
  const send=(me,pa={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:me,params:pa}));});
  const evalJs=async(e)=>(await send('Runtime.evaluate',{expression:e,returnByValue:true})).result?.result?.value;
  await sleep(400); await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate',{url:'https://mail.163.com/'});
  await sleep(9000);
  await send('Runtime.evaluate',{expression:SRC});
  for (const wait of [3000, 6000, 8000]) {
    await sleep(wait === 3000 ? 3000 : 3000);
    const s=await evalJs(`(() => {
      const prof = window.__svi.engines ? (window.__svi.prefs ? 'prefs-ok' : 'no-prefs') : 'no-svi';
      let profile = null;
      try { profile = window.__svi.profileKey ? window.__svi.profileKey() : null; } catch(e) {}
      const bgr = window.__svi.engines && window.__svi.engines.bgReplace;
      return {
        t: Date.now() % 100000,
        svi: !!window.__svi, version: window.__svi && window.__svi.version,
        host: location.host,
        bgrOn: document.documentElement.hasAttribute('data-svi-bgr-on'),
        flashguard: document.documentElement.hasAttribute('data-svi-flashguard'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        bodyTag: document.body ? document.body.getAttribute('data-svi-bgr-bg') : null,
        bucketCount: bgr ? bgr.bucketsBg.size : 'no-bgr',
        bgrActive: bgr ? bgr.active : null,
        profileKey: profile,
      };
    })()`);
    console.log('T+' + wait + ':', JSON.stringify(s));
  }
  const shot=await send('Page.captureScreenshot',{format:'png'});
  const outDir=path.join(__dirname,'shots','163-dark');
  fs.mkdirSync(outDir,{recursive:true});
  fs.writeFileSync(path.join(outDir,'mail163-dark.png'),Buffer.from(shot.result.data,'base64'));
  console.log('shot:', outDir);
  ws.close(); chrome.kill(); try{fs.rmSync(userDataDir,{recursive:true,force:true})}catch(e){}
  process.exit(0);
})().catch(e=>{console.error(e);chrome.kill();process.exit(1);});
