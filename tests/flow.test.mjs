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

/* Which of the ending slides is shown is the presenter's own running choice —
   he has swapped them more than once. What may never happen is one of them
   being deleted to make room, so this holds the whole set and the slide the
   talk ends on rather than a frozen visibility. */
test('the ending keeps every slide it has ever used',()=>{
  for(const id of ['lecture-start-today','lecture-what-remains','lecture-revolution',
    'lecture-tomorrow','lecture-bottom-line',
    'lecture-finale-one-task','lecture-finale-responsibility','lecture-finale-future'])
    assert.ok(deck.slides.some(s=>s.id===id),id);
  const ending=deck.slides.filter(s=>C.isShown(s)).at(-1);
  assert.equal(ending.id,'lecture-thanks');
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

/* A QR code is the one thing on a slide nobody in the room can proof-read: a
   code pointing at the wrong tool looks exactly like a code pointing at the
   right one. `tools/check-qr.mjs` proves each stored code decodes to its own
   URL; this holds the other half — that the slide carrying it says the same
   thing its asset does, and sits behind the tool it belongs to. */
test('every QR slide carries its own tool\'s code',()=>{
  const codes=JSON.parse(readFileSync(new URL('../assets/qr-codes.json',import.meta.url),'utf8'));
  const after={chatgpt:'lecture-search-sources',claude:'lecture-writing',
    gemini:'lecture-notebooklm-concept',notebooklm:'lecture-notebooklm',manus:'lecture-manus-logo'};
  for(const [key,code] of Object.entries(codes)){
    const index=deck.slides.findIndex(s=>s.id==='qr-'+key);
    assert.ok(index>0,key);
    const slide=deck.slides[index];
    assert.equal(deck.slides[index-1].id,after[key]);
    assert.equal(C.isShown(slide),true);
    // the smooth hand-off the presenter asked for: same ground, same backdrop
    assert.equal(slide.palette,deck.slides[index-1].palette);
    assert.equal(slide.backdrop,deck.slides[index-1].backdrop);
    const picture=slide.objects.find(o=>o.type==='image');
    assert.equal(picture.picture,code.picture);
    assert.equal(picture.link,code.url);
    assert.equal(slide.link,code.url);
    assert.ok(picture.picture.startsWith('data:image/png;base64,'));
  }
});
