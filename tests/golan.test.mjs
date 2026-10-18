import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../src/core.js';
const C=globalThis.LectureCore;
const read=(name)=>JSON.parse(readFileSync(new URL('../src/'+name,import.meta.url),'utf8'));
const workshop=C.validate(read('golan.json'));
const lecture=C.validate(read('content.json'));

/* Two talks now share one stage. The browser keeps a presenter's own copy under
   the document's id, so the moment the two ids match, opening one deck hands
   back the other one's slides — the failure that would be discovered in front
   of a room. */
test('the workshop is a separate document from the lecture',()=>{
  assert.notEqual(workshop.documentId,lecture.documentId);
  assert.ok(workshop.documentId.length>0);
  assert.equal(workshop.slides.filter(s=>C.isShown(s)).length,36);
});

/* The source notes run past 500 characters, and the schema stops there. The
   stage note is written for the stage and points at the full guide; what may
   never happen is a note arriving truncated in the middle of a sentence. */
test('every stage note fits the schema without being cut',()=>{
  for(const s of workshop.slides){
    assert.ok(s.note.length<=500,s.id);
    assert.ok(s.note.trim().length>0,s.id);
    assert.ok(/[.?!]$/.test(s.note.trim()),`${s.id} ends mid-sentence`);
  }
});

/* Measured in the browser: these four draw a thin line or an empty card when
   every label is blank, which is how a slide ends up looking unfinished. The
   others carry their own drawing and are fine left bare. */
test('no illustration is left with nothing to draw',()=>{
  const needsLabel=new Set(['accordion','bars','calculation','generation']);
  let hungry=0;
  for(const s of workshop.slides)
    for(const item of s.items??[]){
      if(!needsLabel.has(item.visual)) continue;
      hungry++;
      const labels=[item.label1,item.label2,item.label3].filter(Boolean);
      assert.ok(labels.length>0,`${s.id}/${item.word} draws nothing`);
    }
  assert.ok(hungry>0,'the guard examined no label-hungry illustration');
});

/* The tonal arc is blocks, not sprinkling, and no single transition may become
   the default for the whole deck. */
test('the workshop keeps its tonal and motion variety',()=>{
  const tally=(key)=>workshop.slides.reduce((t,s)=>({...t,[s[key]]:(t[s[key]]??0)+1}),{});
  const transitions=tally('transition');
  for(const [name,n] of Object.entries(transitions))
    assert.ok(n<=workshop.slides.length/3,`${name} is on ${n} slides`);
  assert.equal(Object.keys(transitions).length,6);
  const palettes=tally('palette');
  assert.equal(palettes.violet,2,'violet marks the two human moments');
  assert.equal(palettes.steel,1,'steel marks the calculation that broke');
});

/* The white-mark-on-a-white-stage bug was found once on `slide.mark` and once
   again on free image objects, which the first guard did not look at. The
   workshop's marks are free image objects, so the rule is checked here on both
   carriers and on both decks. */
test('no white tool mark lands on a light slide, in either deck',()=>{
  const light=new Set(Object.entries(C.PALETTE_STYLES)
    .filter(([,style])=>style.tone==='light').map(([key])=>key));
  const marks=JSON.parse(readFileSync(new URL('../assets/tool-marks.json',import.meta.url),'utf8'));
  const named=new Map(Object.entries(marks).map(([name,mark])=>[mark.picture,name]));
  let checked=0;
  for(const [deck,name] of [[workshop,'workshop'],[lecture,'lecture']])
    for(const slide of deck.slides){
      if(!light.has(slide.palette)) continue;
      for(const picture of [slide.mark,...(slide.objects??[]).map(o=>o.picture)]){
        const mark=picture&&named.get(picture);
        if(!mark) continue;
        checked++;
        assert.ok(!/-(white|light)-/.test(mark),
          `${name} slide ${slide.id} is on ${slide.palette} and carries ${mark}`);
      }
    }
  assert.ok(checked>0,'the guard examined no mark on a light slide');
});
