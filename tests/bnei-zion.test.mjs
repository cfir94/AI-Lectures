import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../src/core.js';
const C=globalThis.LectureCore;
const read=(name)=>JSON.parse(readFileSync(new URL('../src/'+name,import.meta.url),'utf8'));
const session=C.validate(read('bnei-zion.json'));
const visual=C.validate(read('bnei-zion-3.json'));
const workshop=C.validate(read('golan.json'));
const lecture=C.validate(read('content.json'));
const shown=session.slides.filter(s=>C.isShown(s));

/* Three talks now share one stage, and the browser keeps each presenter copy
   under its document's id: two ids that match hand one deck the other's
   slides, in front of a room. */
test('every deck is its own document',()=>{
  const ids=[session.documentId,visual.documentId,workshop.documentId,lecture.documentId];
  assert.equal(new Set(ids).size,4,'two decks share a documentId');
  for(const id of ids) assert.ok(id.length>0);
  assert.equal(shown.length,29);
  assert.equal(visual.slides.filter(s=>C.isShown(s)).length,30);
});

/* The prompts are the thing the room was promised: a demo slide keeps its
   prompt off the screen and offers it for copying, so a demo without one is a
   slide that silently promises nothing. */
test('every ready-made prompt is actually there',()=>{
  const marks=JSON.parse(readFileSync(new URL('../assets/tool-marks.json',import.meta.url),'utf8'));
  const known=new Set(Object.values(marks).map(m=>m.picture));
  const demos=[...shown,...visual.slides.filter(s=>C.isShown(s))].filter(s=>s.type==='demo');
  assert.ok(demos.length>=4,`only ${demos.length} prompt slides`);
  for(const s of demos){
    assert.ok(s.prompt.trim().length>120,`${s.id} carries no real prompt`);
    /* Ideogram and Flow have no rasterised mark, so those slides name the tool
       in text rather than carry a drawing of somebody's logo. */
    if(s.mark) assert.ok(known.has(s.mark),`${s.id} carries a mark that is not in the manifest`);
    assert.match(s.link,/^https:\/\//,`${s.id} has no openable link`);
    assert.ok(s.tool.trim().length>0,`${s.id} does not name its tool`);
  }
});

/* A note is what the presenter reads while the room reads the slide. */
test('every slide carries a presenter note',()=>{
  for(const s of [...session.slides,...visual.slides]){
    assert.ok(s.note.trim().length>0,`${s.id} has no note`);
    assert.ok(s.note.length<=500,`${s.id} note is over the limit`);
    assert.ok(/[.?!]$/.test(s.note.trim()),`${s.id} note ends mid-sentence`);
  }
});

/* The arc moves in acts, and no transition may become the default. */
test('each session keeps its tonal and motion variety',()=>{
  for(const [deck,name] of [[session,'session two'],[visual,'session three']]){
    const stage=deck.slides.filter(s=>C.isShown(s));
    const tally=(key)=>stage.reduce((t,s)=>({...t,[s[key]]:(t[s[key]]??0)+1}),{});
    const transitions=tally('transition');
    assert.equal(Object.keys(transitions).length,6,`${name}: a transition is unused`);
    for(const [t,n] of Object.entries(transitions))
      assert.ok(n<=stage.length/3,`${name}: ${t} is on ${n} of ${stage.length} slides`);
    const palettes=tally('palette');
    assert.equal(palettes.violet,2,`${name}: violet marks the two human moments`);
    assert.equal(palettes.steel,1,`${name}: steel marks the one thing that broke`);
  }
});

/* Same drift as the workshop's: a re-rendered diagram that was never
   re-embedded leaves the deck showing the old picture, and it looks exactly
   like the new one until someone reads it. */
test('every diagram on a slide is the one its source produced',()=>{
  const made=JSON.parse(readFileSync(new URL('../assets/diagrams.json',import.meta.url),'utf8'));
  const known=new Map(Object.entries(made).map(([name,d])=>[d.picture,name]));
  let found=0;
  for(const s of [...session.slides,...visual.slides]){
    if(s.type!=='image'||!s.picture) continue;
    found++;
    assert.ok(known.has(s.picture),`slide ${s.id} carries a picture no diagram source produced`);
    assert.ok(s.alt.trim().length>0,`slide ${s.id} has no alt text`);
  }
  assert.ok(found>=12,`only ${found} diagram slides`);
});
