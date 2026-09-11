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

test('opening, audience question and presenter motion stay staged as designed',()=>{
  const opening=deck.slides.find(s=>s.id==='lecture-open');
  const question=deck.slides.find(s=>s.id==='lecture-question');
  const presenter=deck.slides.find(s=>s.id==='lecture-good-morning');
  assert.equal(opening.objects.find(o=>o.bind==='title').style,'shimmer');
  assert.equal(question.objects.find(o=>o.bind==='title').y,'32');
  assert.equal(question.objects.find(o=>o.bind==='accent').y,'47');
  assert.ok(presenter.objects.every(o=>o.exit==='none'));
});

test('slide 8 dissolves and motion layers expose matching object presets',()=>{
  const slide8=deck.slides.find(s=>s.id==='lecture-three-families');
  assert.equal(slide8.transition,'dissolve');
  for(const key of [...Object.keys(C.MOTIONS),...Object.keys(C.TRANSITIONS)]){
    if(key==='still'||key==='cut') continue;
    assert.ok(C.OBJECT_ENTRANCES[key],`${key} is missing from object entrances`);
    assert.ok(C.OBJECT_EXITS[key],`${key} is missing from object exits`);
  }
});

test('slide transitions cannot overwrite content or object entrances',()=>{
  const css=readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.ok(!css.includes('.slide.entering > .scene'));
  assert.ok(!css.includes('.slide.entering > .free-object-layer'));
  assert.match(css,/\.slide\.entering > \.atmosphere:not\(\.backdrop-retained\)/);
  assert.match(app,/previewingSlideMotion = true/);
  assert.match(app,/fresh\.replaceWith\(held\)/);
});
