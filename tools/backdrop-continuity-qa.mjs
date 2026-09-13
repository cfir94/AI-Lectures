import {chromium,browserOptions} from './browser-runtime.mjs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const browser=await chromium.launch(browserOptions);
const page=await browser.newPage({viewport:{width:1440,height:810}});
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log(e.message)});
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.locator('#slide-dots button').nth(11).evaluate(e=>e.click());
await page.waitForTimeout(1800);
for(const index of [12,13,12,11,12,13]) {
 const samples=await page.evaluate(async index=>{
  const old=document.querySelector('.slide:not(.leaving) > .atmosphere');
  document.querySelectorAll('#slide-dots button')[index].click();
  const samples=[];
  for(let i=0;i<90;i++){
   await new Promise(requestAnimationFrame);
   const active=document.querySelector('.slide:not(.leaving)');
   const bg=active.querySelector(':scope > .atmosphere');
   const a=getComputedStyle(active),b=getComputedStyle(bg);
   samples.push({cls:active.className,old:old?.className,bg:bg?.className,same:bg===old,visible:a.visibility==='visible'&&b.visibility==='visible',opacity:Number(b.opacity),transform:b.transform});
  }
  return samples;
 },index);
 assert.ok(samples.every(s=>s.same&&s.visible&&s.opacity>0.9&&s.transform==='none'),JSON.stringify(samples.filter(s=>!s.visible||s.opacity<.9||s.transform!=='none')));
 console.log('Continuous backdrop to slide',index+1, samples.length,'frames');
}
await page.waitForTimeout(2500);
assert.ok(await page.locator('.slide:not(.leaving) .object-image').isVisible());
await page.screenshot({path:resolve('.cache/gemini-fixed.png')});
assert.deepEqual(errors,[]);
await browser.close();


