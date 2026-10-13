import fs from 'node:fs/promises';
import {slides} from './materials.mjs';

// Calm continuation; a tonal change lands cleanly, without a traveling frame.
// The presenter explicitly requested restraint over transition variety.
const plan=slides.map((slide,index)=>({
  title:slide.title,
  layout:slide.layout,
  transition: index===0 || (slide.theme||'pearl')!==(slides[index-1].theme||'pearl')
    ? 'ppEffectCut' : 'ppEffectFadeSmoothly',
  cascadeTitle:false,
}));
await fs.mkdir('.cache/course-build',{recursive:true});
await fs.writeFile('.cache/course-build/motion-plan.json',JSON.stringify(plan,null,2));
console.log(`Prepared restrained animation choices for ${plan.length} slides.`);

