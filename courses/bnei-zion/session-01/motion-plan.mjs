import fs from 'node:fs/promises';
import { slides } from './materials.mjs';

// Each block has a deliberate arrival; no transition dominates the deck.
const cuts = new Set([1,6,7,9,10,28,29,33,36,37,39,40,41,42]);
const pushes = new Set([13,17,22,25,31,34,38,43,46]);
const zooms = new Set([3,12,18,23,27,32,35,44]);
const recedes = new Set([15,21,24,26,30,45,47]);
const dissolves = new Set([5,8,16,20,48]);
const plan = slides.map((slide,index) => ({
  title: slide.title,
  layout: slide.layout,
  transition: cuts.has(index+1) ? 'ppEffectCut'
    : pushes.has(index+1) ? 'ppEffectPushRight'
    : zooms.has(index+1) ? 'ppEffectFlyThroughIn'
    : recedes.has(index+1) ? 'ppEffectFlyThroughOut'
    : dissolves.has(index+1) ? 'ppEffectFadeSmoothly' : 'ppEffectFade',
  cascadeTitle: [2,8,26,45].includes(index+1),
}));
await fs.mkdir('.cache/course-build', {recursive:true});
await fs.writeFile('.cache/course-build/motion-plan.json',JSON.stringify(plan,null,2));
console.log(`Prepared animation choices for ${plan.length} slides.`);
