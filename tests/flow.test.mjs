import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../src/core.js';
const C=globalThis.LectureCore;
const deck=C.validate(JSON.parse(readFileSync(new URL('../src/content.json',import.meta.url),'utf8')));

test('the supplied Meta article opens the article sequence',()=>{
  const article=deck.slides.findIndex(s=>s.id==='lecture-agents-work-article');
  assert.ok(deck.slides[article].picture.startsWith('data:image/'));
  assert.equal(C.isShown(deck.slides[article]),true);
  assert.equal(deck.slides[article].imageLayout,'editorial');
  const forward=C.transition({slide:article-1,step:C.beats(deck,article-1)-1},'next',deck);
  assert.equal(forward.slide,article);
  assert.equal(deck.slides[article+1].id,'lecture-nobel');
});

test('replacement ending preserves the three original slides as hidden',()=>{
  for(const id of ['lecture-start-today','lecture-what-remains','lecture-revolution'])
    assert.equal(C.isShown(deck.slides.find(s=>s.id===id)),false);
  for(const id of ['lecture-finale-one-task','lecture-finale-responsibility','lecture-finale-future'])
    assert.equal(C.isShown(deck.slides.find(s=>s.id===id)),true);
});

test('agent actions and article layout survive portable validation',()=>{
  const agent=deck.slides.find(s=>s.type==='agent');
  assert.equal(C.beats(deck,deck.slides.indexOf(agent)),5);
  assert.equal(C.validate(C.clone(deck)).slides.find(s=>s.id===agent.id).items[1].second,'רביעי · 14:30');
  const invalid=C.clone(deck);
  invalid.slides.find(s=>s.type==='agent').items[0].kind='unsafe';
  assert.throws(()=>C.validate(invalid));
  const missingChoice=C.clone(deck);
  missingChoice.slides.find(s=>s.type==='agent').items[1].first='';
  assert.throws(()=>C.validate(missingChoice));
  const image=C.blankSlide('image');
  assert.equal(image.imageLayout,'overlay');
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
  assert.deepEqual(Object.keys(C.OBJECT_MOTION_EQUIVALENTS),Object.keys(C.MOTIONS));
  for(const preset of Object.values(C.OBJECT_MOTION_EQUIVALENTS))
    assert.ok(C.OBJECT_ENTRANCES[preset],`${preset} is not a valid object entrance`);
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
  assert.match(css,/\.slide\.transition-preview \.free-object/);
  assert.match(app,/previewingSlideMotion = true/);
  assert.match(app,/previewingSlideTransition = true/);
  assert.match(app,/state = C\.goTo\(deck, slideIndex\)/);
  assert.match(app,/objectEntrance === "cascade" && object\.type !== "text"/);
  assert.match(app,/fresh\.replaceWith\(held\)/);
});
