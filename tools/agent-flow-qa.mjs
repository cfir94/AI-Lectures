/* Browser regression for the September 12 content and interaction pass. */
import {chromium, browserOptions} from './browser-runtime.mjs';
import {readFile, mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import '../src/core.js';
const deck=JSON.parse(await readFile(new URL('../src/content.json',import.meta.url),'utf8'));
const output=resolve('.cache/agent-qa'); await mkdir(output,{recursive:true});
const browser=await chromium.launch(browserOptions);
const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
const requests=[]; page.on('request',r=>requests.push(r.url()));
await page.goto(pathToFileURL(resolve('dist/index.html')).href);
await page.waitForTimeout(1400);
const shown=deck.slides.filter(s=>s.visibility!=='hidden');
async function jump(id) {
  const s=shown.findIndex(s=>s.id===id);
  assert.ok(s>=0,id);
  await page.mouse.move(700,820);
  const dot=page.locator('#slide-dots button').nth(s);
  if(await dot.isVisible()) await dot.click({force:true});
  else await dot.evaluate(e=>e.click());
  await page.waitForTimeout(1600);
}
const take=async id=>{await page.locator('#stage').screenshot({path:resolve(output,id+'.png')});};
for(const id of ['lecture-open','lecture-model-intro','lecture-chatbot','lecture-agent-demo','lecture-agent-anatomy','lecture-agents-work-article','lecture-nobel','lecture-singapore','lecture-reuters','lecture-finale-one-task','lecture-finale-responsibility','lecture-finale-future']) {
  await jump(id); await take(id);
  if(id.includes('article')||['lecture-nobel','lecture-singapore','lecture-reuters'].includes(id)) {
    const bounds=await page.evaluate(()=>{const box=s=>{const r=document.querySelector(s).getBoundingClientRect();return {top:r.top,bottom:r.bottom};};return {image:box('.image-frame'),text:box('.image-text')};});
    assert.ok(bounds.image.bottom<bounds.text.top,`${id}: article and heading overlap`);
  }
}
await jump('lecture-agent-anatomy');
await page.locator('[data-action="agent-run"]').click();
assert.match(await page.locator('.agent-result').innerText(),/זמינות/);
await page.locator('[data-action="agent-next"]').click();
await page.locator('[data-action="agent-choose"][data-key="second"]').click();
await page.locator('[data-action="agent-change"]').click();
assert.equal(await page.locator('.agent-result').count(),0);
await page.locator('[data-action="agent-choose"][data-key="first"]').click();
assert.match(await page.locator('.agent-result').innerText(),/שלישי/);
await page.locator('[data-action="agent-change"]').click();
await page.locator('[data-action="agent-choose"][data-key="second"]').click();
await page.locator('[data-action="agent-next"]').click();
await page.locator('[data-action="agent-run"]').click();
assert.match(await page.locator('.agent-result').innerText(),/רביעי · 14:30/);
await take('agent-draft');
await page.locator('[data-action="agent-next"]').click();
await page.locator('[data-action="agent-run"]').click();
await page.locator('[data-action="agent-next"]').click();
assert.equal(await page.locator('.agent-result').count(),0);
await page.keyboard.press('ArrowLeft');
assert.equal(await page.locator('.agent-result').count(),0,'keyboard must not approve');
await page.locator('[data-action="agent-revise"]').click();
assert.match(await page.locator('.agent-copy h1').innerText(),/בודק/);
await page.locator('[data-action="agent-run"]').click();
await page.locator('[data-action="agent-next"]').click();
await page.locator('[data-action="agent-run"]').click();
assert.match(await page.locator('.agent-result').innerText(),/לא נשלחה/);
await take('agent-approved');
await page.locator('[data-action="agent-reset"]').click();
assert.equal(await page.locator('.agent-result').count(),0);
assert.match(await page.locator('.agent-copy h1').innerText(),/מתכנן/);
await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1500);
assert.match(await page.locator('#slide-root > .slide:last-child').innerText(),/נותנים מטרה/);
await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(1500);
assert.equal(await page.locator('.agent-slide').count(),1);
// The new type uses the same editor and standalone export as the rest.
await page.mouse.move(700,850); await page.locator('#deck').click();
assert.equal(await page.locator('details[open] select[data-field$=".kind"]').count(),5);
const downloadWait=page.waitForEvent('download');
await page.locator('#export-html').click();
const download=await downloadWait;
const exported=resolve(output,'exported.html'); await download.saveAs(exported);
await page.keyboard.press('Escape');
const exportPage=await browser.newPage();
await exportPage.goto(pathToFileURL(exported).href);
assert.equal(await exportPage.locator('#slide-dots button').count(),shown.length);
await exportPage.close();
await page.waitForTimeout(4200); // Let the successful-export toast finish.
await page.setViewportSize({width:390,height:844});
for(const id of ['lecture-agent-anatomy','lecture-agents-work-article','lecture-finale-future']) {
  await jump(id); await take(id+'-narrow');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),id+' horizontal overflow');
}
// Cover render paths that currently live only in the preserved hidden slides.
const C=globalThis.LectureCore;
const everyType={...deck,documentId:'qa-agent-types',slides:Object.keys(C.SLIDE_TYPES).map(type=>C.blankSlide(type))};
await page.setViewportSize({width:1440,height:900});
await page.locator('#import-file').setInputFiles({name:'qa-types.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(C.validate(everyType)))});
await page.waitForTimeout(1600);
await page.keyboard.press('Escape');
for(let i=0;i<everyType.slides.length;i++) {
  await page.locator('#slide-dots button').nth(i).evaluate(e=>e.click());
  await page.waitForTimeout(100);
  assert.ok((await page.locator('#slide-root > .slide:last-child').count())===1);
}
assert.deepEqual(errors,[]);
assert.ok(requests.every(url=>!/^https?:/.test(url)),'standalone deck must not load network assets');
await browser.close();
console.log('Passed: article separation, agent choices/draft/approval/reset, keyboard, editor, HTML export, narrow viewport, no network, no console errors.');
