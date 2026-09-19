// Measure the hashnode avatar(s) that got auto-inverted: rendered size + pixels.
const { spawn } = require('child_process');
const fs = require('fs'); const path = require('path'); const http = require('http'); const os = require('os');
const CHROME = process.env.SVI_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const CDP_PORT = 9248;
const userDataDir = fs.mkdtempSync(os.tmpdir() + '/svi-av-');
const chrome = spawn(CHROME, ['--remote-debugging-port='+CDP_PORT, '--user-data-dir='+userDataDir, '--headless=new','--disable-gpu','--no-first-run','--enable-unsafe-swiftshader', ...(process.env.HTTPS_PROXY?['--proxy-server='+process.env.HTTPS_PROXY]:[]), '--window-size=1440,2400', 'about:blank'], {stdio:'ignore'});
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
  await send('Page.navigate',{url:'https://hashnode.com/'});
  await sleep(10000);
  await send('Runtime.evaluate',{expression:SRC});
  await sleep(9000);
  const r=await evalJs(`(async () => {
    const out = [];
    for (const img of document.querySelectorAll('img')) {
      const src = img.currentSrc || img.src || '';
      if (!/avatars|googleusercontent/.test(src)) continue;
      const cv=document.createElement('canvas');
      const w=Math.min(img.naturalWidth||100,150), h=Math.min(img.naturalHeight||100,150);
      if(!w||!h) continue;
      cv.width=w; cv.height=h;
      const ctx=cv.getContext('2d');
      try { ctx.drawImage(img,0,0,w,h); } catch(e) { continue; }
      let d; try { d=ctx.getImageData(0,0,w,h).data; } catch(e) { continue; }
      let opaque=0, light=0, lumSum=0;
      for(let i=0;i<d.length;i+=4){ const a=d[i+3]; if(a>10){opaque++; const lum=(d[i]*77+d[i+1]*150+d[i+2]*29)>>8; lumSum+=lum; if(lum>=180) light++;} }
      out.push({ src: src.slice(0,90), rendered: img.clientWidth+'x'+img.clientHeight, natural: img.naturalWidth+'x'+img.naturalHeight,
        cls: String(img.className).slice(0,50), inv: img.getAttribute('data-svi-inverted'),
        opaqueRatio: +(opaque/(w*h)).toFixed(2), lightRatio: opaque?+(light/opaque).toFixed(2):null, meanLum: opaque?Math.round(lumSum/opaque):null });
    }
    return out;
  })()`, true);
  console.log(JSON.stringify(r, null, 1));
  ws.close(); chrome.kill(); try{fs.rmSync(userDataDir,{recursive:true,force:true})}catch(e){}
  process.exit(0);
})().catch(e=>{console.error(e);chrome.kill();process.exit(1);});
