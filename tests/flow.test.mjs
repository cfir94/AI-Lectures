import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../src/core.js';
const C=globalThis.LectureCore;
const deck=C.validate(JSON.parse(readFileSync(new URL('../src/content.json',import.meta.url),'utf8')));

test('the 2030 flow preserves its missing article without projecting it',()=>{
  const article=deck.slides.findIndex(s=>s.id==='lecture-agents-work-article');
  assert.equal(deck.slides[article].picture,'');
  assert.equal(C.isShown(deck.slides[article]),false);
  const forward=C.transition({slide:article-1,step:C.beats(deck,article-1)-1},'next',deck);
  assert.equal(forward.slide,article+1);
});

test('curtain and gathering presets survive portable serialization',()=>{
  const copy=C.validate(JSON.parse(C.safeJSON(deck)));
  const gemini=copy.slides.find(s=>s.id==='lecture-gemini-focus');
  const notebook=copy.slides.find(s=>s.id==='lecture-notebooklm');
  assert.equal(gemini.objects[0].entrance,'gather');
  assert.equal(gemini.objects[0].exit,'curtain');
  assert.equal(notebook.objects[0].entrance,'curtain');
  assert.equal(notebook.transition,'cut');
  const invalid=C.clone(copy);invalid.slides.find(s=>s.id===gemini.id).objects[0].exit='untrusted';
  assert.throws(()=>C.validate(invalid));
});
