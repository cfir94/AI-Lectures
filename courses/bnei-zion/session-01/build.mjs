import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const focused=process.env.LECTURE_COURSE_VARIANT==='focused';
const {sources,links,prompts,blocks,slides,sections}=await import(focused?'./focused-materials.mjs':'./materials.mjs');

const root=process.cwd();
const runtime=process.env.LECTURE_NODE_MODULES || path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules');
process.env.RUNTIME_NODE_MODULES=runtime;
const {Presentation,PresentationFile}=await import(pathToFileURL(path.join(runtime,'@oai/artifact-tool/dist/artifact_tool.mjs')));
const skill=process.env.PRESENTATION_SKILL_DIR || path.join(process.env.USERPROFILE,'.codex/plugins/cache/openai-primary-runtime/presentations/26.1011.11113/skills/presentations');
const tmp=path.join(root,focused?'.cache/course-focused':'.cache/course-build');
const output=path.join(root,focused?'output/bnei-zion-session-01-focused':'output/bnei-zion-session-01');
await fs.mkdir(tmp,{recursive:true}); await fs.mkdir(output,{recursive:true});
const deck=JSON.parse(await fs.readFile('src/content.json','utf8'));
const marks=JSON.parse(await fs.readFile('assets/tool-marks.json','utf8'));
const source=id=>deck.slides.find(s=>s.id===id);
const art={opening:source('lecture-open').backdropPicture,model:source('lecture-model-intro').backdropPicture,
 portrait:source('lecture-good-morning').objects.find(o=>o.type==='image').picture,ending:source('lecture-finale-future').backdropPicture};
const logo={chatgpt:marks['chatgpt-logo-black-png'].picture,gemini:source('lecture-gemini-logo').objects[0].picture,
 claude:source('lecture-claude-logo').objects[0].picture,copilot:marks['microsoft-copilot-logo-colored-svg'].picture,
 notebook:marks['notebooklm-logo-black-svg'].picture,manus:source('lecture-manus-logo').objects[0].picture};
if(focused)logo.perplexity='data:image/svg+xml;base64,'+Buffer.from(await fs.readFile('courses/bnei-zion/session-01/assets/perplexity-logo-cropped.svg')).toString('base64');
const colours={pearl:{bg:'#f7f8fc',fg:'#191b2b',muted:'#5d647c',accent:'#7a59bc',blue:'#4378ab'},
 cobalt:{bg:'#18243d',fg:'#f7f8fc',muted:'#b9c6d9',accent:'#ac94df',blue:'#7fb2d9'},
 steel:{bg:'#171b22',fg:'#f7f8fc',muted:'#b9c3ce',accent:'#ac94df',blue:'#7fb2d9'},
 violet:{bg:'#332746',fg:'#f7f8fc',muted:'#c4bdd5',accent:'#ac94df',blue:'#7fb2d9'}};
const presentation=Presentation.create({slideSize:{width:1280,height:720}});
function text(slide,value,x,y,w,h,size,colour,align='right',bold=false,uri) {
 const shape=slide.shapes.add({name:'editable-'+String(value).slice(0,35),geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});
 shape.text=uri ? [[{run:value,link:{uri,isExternal:true}}]] : value;
 shape.text.style={fontSize:size,typeface:'Arial',color:colour,alignment:align,verticalAlignment:'middle',insets:0,autoFit:'none',bold};
 if(bold && ['#7a59bc','#ac94df'].includes(colour))shape.text.fill={type:'gradient',gradientKind:'linear',angleDeg:0,stops:[{offset:0,color:colour==='#7a59bc'?'#4378ab':'#7fb2d9'},{offset:100000,color:colour}]};
 return shape;
}
function image(slide,data,x,y,w,h,fit='contain',alt='') {return slide.images.add({dataUrl:data,position:{left:x,top:y,width:w,height:h},fit,alt});}
function title(s,v,c,size=58,x=90,y=80,w=1100,h=154,align='right'){return text(s,v,x,y,w,h,size,c,align,true);}
for (const [i,item] of slides.entries()) {
 const slide=presentation.slides.add();const c=colours[item.theme||'pearl'];
 slide.background.fill=item.theme && item.theme!=='steel' ? {type:'gradient',gradientKind:'linear',angleDeg:140,stops:[{offset:0,color:c.bg},{offset:100000,color:item.theme==='pearl'?'#edf0fa':item.theme==='violet'?'#24253f':'#292940'}]} : c.bg;
 switch(item.layout) {
  case 'cover':
   image(slide,art.opening,0,0,1280,720,'cover','יצירה שסיפק המרצה למצגת הקיימת');
   text(slide,'בית הספר האקדמי לסיעוד בני ציון',635,100,555,60,25,c.muted);
   title(slide,item.title,c.accent,64,635,210,555,200);
   text(slide,item.body,630,442,560,120,30,c.fg);
   text(slide,'כפיר משה יעקובי',635,594,555,48,25,c.muted);break;
  case 'portrait':
   image(slide,art.portrait,105,120,355,480,'cover','כפיר משה יעקובי');
   title(slide,'נעים להכיר',c.muted,32,555,155,625,65);
   title(slide,item.title,c.accent,56,555,260,625,150);
   text(slide,item.body,555,452,625,105,30,c.fg);break;
  case 'art':
   image(slide,art.model,0,0,1280,720,'cover','המחשת מודל שפה שסיפק המרצה');
   title(slide,item.title,colours.pearl.fg,52,720,200,475,120);
   text(slide,item.body,740,365,455,160,32,colours.pearl.accent);break;
  case 'logos': {
   title(slide,item.title,c.fg,60,80,65,1120,100);
   const positions=[[720,250],[110,250],[720,425],[110,425]];
   item.marks.forEach((key,j)=>{const [x,y]=positions[j];image(slide,logo[key],x,y,430,90,'contain',key);});
   text(slide,item.body,90,610,1100,60,29,c.muted,'center');break;
  }
  case 'list': {
   title(slide,item.title,c.fg,58,90,72,1100,134);
   const lines=item.body.split('\n'),gap=lines.length===4?91:108;
   lines.forEach((line,j)=>text(slide,line,90,225+j*gap,1100,76,42,j===0?c.accent:c.fg));break;
  }
  case 'compare': {
   title(slide,item.title,c.fg,58,90,80,1100,160);
   if(item.comparison){
    item.comparison.forEach((side,j)=>{const x=j===0?695:95;const colour=j===0?c.accent:c.blue;
     text(slide,side.label,x,300,475,64,33,c.muted,'center');
     text(slide,side.value,x,380,475,100,72,colour,'center');
     text(slide,side.caption,x,505,475,70,37,c.fg,'center');});break;
   }
   const lines=item.body.split('\n');
   text(slide,lines[0],695,320,475,160,42,c.accent,'center');
   text(slide,lines[1],95,320,475,160,42,c.blue,'center');break;
  }
  case 'tool': {
   title(slide,item.title,c.fg,58,660,100,530,170,'right');
   text(slide,item.body,660,276,530,180,38,c.accent);
   if(logo[item.tool])image(slide,logo[item.tool],90,240,475,150,'contain',item.title);
   else text(slide,'Perplexity',80,250,510,150,64,c.blue,'left',true);
   text(slide,item.linkLabel,690,550,500,50,26,c.blue,'right',false,item.link);break;
  }
  case 'exercise':
   text(slide,item.minutes,70,175,280,215,144,c.accent,'center');
   text(slide,'דקות',100,390,220,65,31,c.muted,'center');
   title(slide,item.title,c.fg,56,440,105,740,190);
   text(slide,item.body,440,332,740,224,38,c.accent);
   text(slide,'הפרומפט המלא בדף התרגול',440,608,740,44,25,c.muted);break;
  case 'break':
   text(slide,item.minutes,90,125,1100,230,168,c.accent,'center');
   title(slide,item.title,c.fg,66,90,385,1100,110,'center');
   text(slide,item.body,90,525,1100,80,32,c.muted,'center');break;
  case 'closing':
   image(slide,art.ending,0,0,1280,720,'cover','יצירת הסיום שסיפק המרצה');
   title(slide,item.title,c.fg,60,570,130,620,135);
   text(slide,item.body,570,320,620,140,40,c.accent);
   text(slide,'cfir94@gmail.com',570,532,620,68,34,c.blue,'right');
   text(slide,'052-656-8094',570,607,620,68,34,c.blue,'right');break;
  case 'personalization':
   title(slide,item.title,c.fg,54,400,72,790,138);
   image(slide,logo[item.tool],90,96,245,64,'contain',item.tool);
   text(slide,item.body,90,229,1100,74,38,c.accent);
   text(slide,item.example,90,333,1100,146,32,c.fg);
   text(slide,'בהגדרות: הוראות אישיות, או בתחילת השיחה',90,516,1100,52,28,c.muted);
   text(slide,'תפקיד וסגנון — בלי מידע רגיש',90,586,1100,44,24,c.muted);break;
  case 'prompt-structure':
   title(slide,item.title,c.fg,58,90,100,1100,150);
   text(slide,item.body,90,300,1100,110,52,c.accent,'center',true);
   text(slide,item.caption,90,470,1100,110,30,c.muted,'center');break;
  case 'prompt-example':
   title(slide,item.title,c.fg,54,400,72,790,138);
   image(slide,logo[item.tool],90,96,245,64,'contain',item.tool);
   item.parts.forEach((part,j)=>{
    text(slide,part.label,995,232+j*82,195,68,32,c.accent,'right',true);
    text(slide,part.text,90,232+j*82,850,68,30,c.fg);
   });
   text(slide,'הפרומפט המלא כולל את מסמך א — מוכן להעתקה בדף התרגול',90,599,1100,48,24,c.muted);break;
  case 'models':
   title(slide,item.title,c.fg,58,400,72,790,138);
   image(slide,logo[item.tool],90,96,245,64,'contain',item.tool);
   text(slide,item.body,90,223,1100,70,40,c.accent,'center');
   item.models.forEach((model,j)=>{const x=930-j*280;
    text(slide,model.name,x,348,240,64,42,c.fg,'center',true);
    text(slide,model.label,x,438,240,60,29,c.accent,'center');
    text(slide,model.example,x,502,240,58,25,c.muted,'center');
   });
   text(slide,item.caption,90,610,1100,44,24,c.muted,'center');break;
  case 'gemini-tools':
   title(slide,item.title,c.fg,54,400,72,790,138);
   image(slide,logo.gemini,90,96,245,64,'contain','Gemini');
   text(slide,item.body,90,224,1100,70,33,c.muted,'center');
   text(slide,'Canvas',690,326,500,64,44,c.accent,'right',true);
   text(slide,'מסמך שאפשר לערוך ולשפר',690,397,500,58,28,c.fg);
   text(slide,'״צור דף הדרכה של עמוד אחד\nמתוך מסמך א בלבד.״',690,480,500,105,28,c.fg);
   text(slide,'יצירת תמונות',90,326,500,64,44,c.accent,'right',true);
   text(slide,'איור לפי תיאור, סגנון וקומפוזיציה',90,397,500,58,27,c.fg);
   text(slide,'״צור איור לצוות ביום הדרכה.\nהשאר מקום לכותרת בצד ימין.״',90,480,500,105,28,c.fg);
   text(slide,'הפרומפטים המלאים מוכנים להעתקה בדף התרגול',90,608,1100,44,23,c.muted,'center');break;
  case 'prompt-demo':
   title(slide,item.title,c.fg,54,400,72,790,138);
   image(slide,logo[item.tool],90,96,245,64,'contain',item.tool);
   text(slide,item.body,90,254,1100,292,34,c.fg);
   text(slide,'הפרומפט המלא עם המקור מוכן להעתקה בדף התרגול',90,587,1100,52,24,c.muted);break;
  case 'lecture-evidence': {
   const original=source(item.lectureId);
   title(slide,item.title,c.fg,54,90,35,1100,95);
   text(slide,item.body,90,137,1100,45,24,c.muted);
   image(slide,original.picture,90,196,1100,446,'contain',original.alt);break;
  }
  case 'lecture-video': {
   const original=source(item.lectureId);
   title(slide,item.title,c.fg,54,90,35,1100,95);
   text(slide,item.body,90,137,1100,45,24,c.muted);
   image(slide,original.poster,220,196,840,472.5,'contain',item.title);
   text(slide,'הפעלת הסרטון',90,676,260,32,24,c.blue,'right',false,'videos/figure-03-home.mp4');break;
  }
  case 'quote':
   title(slide,item.title,c.muted,33,90,95,1100,70);
   text(slide,item.body,110,250,1060,250,58,c.accent,'center',false);break;
  case 'prompt':
   title(slide,item.title,c.fg,59,90,120,1100,155);
   text(slide,item.body,110,330,1070,180,45,c.accent);
   text(slide,'הנוסח המלא בדף התרגול',110,590,1070,54,26,c.muted);break;
  default:
   title(slide,item.title,c.accent,68,90,130,1100,230,'center');
   text(slide,item.body,130,390,1020,200,item.body.split('\n').length===3?48:40,c.fg,'center');
 }
 if(item.prompt)text(slide,item.prompt,90,656,450,35,21,c.muted,'left');
 text(slide,String(i+1).padStart(2,'0'),1192,659,44,28,16,c.muted,'right');
 const ps=prompts.filter(p=>item.prompt?.includes(p.id));
 slide.speakerNotes.text=item.notes + (ps.length?'\n\nפרומפטים להעתקה\n'+ps.map(p=>p.id+' — '+p.title+'\n'+p.text+'\nבדיקה: '+p.check).join('\n\n'):'')+
  '\n\nקהל: 11 משתתפים מרפואה ואדמיניסטרציה, מחשבים אישיים וללא מנוי בתשלום.\n'+(item.refs?.length?'מקורות:\n'+item.refs.join('\n'):'')+(item.art?'\nאיור או צילום: אסט מתוך המצגת הקיימת של המרצה, שסופק על ידו.':'');
 const png=await presentation.export({slide,format:'png',scale:1});
 await fs.writeFile(path.join(tmp,`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));
 console.log('rendered',i+1);
}
const candidate=path.join(tmp,'session-01-draft.pptx');
await(await PresentationFile.exportPptx(presentation)).save(candidate);
// Declare RTL paragraphs in the package too, not only right alignment.
// Native PowerPoint needs RTL paragraph metadata. Artifact Tool's preview
// may reverse Hebrew word order; native PowerPoint renders are authoritative.
const {spawnSync}=await import('node:child_process');
const py=path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
const patch=spawnSync(py,[path.join(root,'courses/bnei-zion/session-01/rtl-package.py'),candidate],{encoding:'utf8'});
if(patch.status!==0)throw Error(patch.stderr);
if(!process.env.LECTURE_DRAFT_ONLY){
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')));
const result=await finalizePresentation({workspaceDir:root,candidatePath:candidate,
 finalPath:path.join(output,'בינה מלאכותית בעבודה שלכם - מפגש ראשון.pptx'),
 pythonExecutable:py,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
 layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
 layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],
 explicitTotalSlideCount:slides.length,fontPolicy:{basis:'design',families:['Arial']},verifyArtifactToolImport:true,
 receiptPath:path.join(tmp,`validation-${Date.now()}.json`)});
console.log('Finalized',result);
}
if(focused){
 await fs.writeFile(path.join(tmp,'sections.json'),JSON.stringify(sections,null,2));
 const plan=slides.map((s,i)=>({title:s.title,layout:s.layout,visibility:s.visibility||'shown',transition:i===0 || (s.theme||'pearl')!==(slides[i-1].theme||'pearl')?'ppEffectCut':'ppEffectFadeSmoothly',cascadeTitle:false}));
 await fs.writeFile(path.join(tmp,'motion-plan.json'),JSON.stringify(plan,null,2));
}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
for(const [name,key] of [['מסמך א - מפגש הדרכה.txt','health'],['מסמך ב - עדכון מפגש.txt','update'],['מסמך ג - תדרוך צוות.txt','admin']])await fs.writeFile(path.join(output,name),'\ufeff'+sources[key]);
let handbook=`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>מפגש 1 — תרגילים ופרומפטים</title><style>
body{font-family:Arial,sans-serif;margin:0;background:#f7f8fc;color:#191b2b;line-height:1.65}main{max-width:940px;margin:auto;padding:48px 26px}h1{font-size:40px;color:#7a59bc}h2{font-size:29px;margin-top:48px}a{color:#4378ab}pre{font-family:Arial;white-space:pre-wrap;background:white;padding:24px;border:1px solid #dce1ef;border-radius:12px;font-size:18px;line-height:1.8;direction:rtl}button{font:inherit;color:white;background:#4378ab;border:0;border-radius:8px;padding:10px 18px;cursor:pointer}nav{display:flex;flex-wrap:wrap;gap:14px}section{margin-block:34px}details{margin:18px 0}summary{cursor:pointer;font-weight:bold}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:right;border-bottom:1px solid #dce1ef}small{color:#5d647c}@media print{button{display:none}pre{break-inside:avoid}body{background:white}}</style><main>
<h1>בינה מלאכותית בעבודה שלכם</h1><p>מפגש 1 · צוות בית הספר האקדמי לסיעוד בני ציון</p><p>כל התרחישים והמסמכים בערכה פיקטיביים. אין להעלות פרטי מטופלים, תיעוד קליני אמיתי או מסמכים פנימיים. טיוטה רפואית מחייבת בדיקה מקצועית והרשאה מתאימה לפני שימוש.</p>
<h2>קישורי הכלים</h2><nav>${Object.entries({ChatGPT:links.chatgpt,Claude:links.claude,Gemini:links.gemini,Copilot:links.copilot,Perplexity:links.perplexity,NotebookLM:links.notebook,Manus:links.manus}).map(([n,u])=>`<a target="_blank" rel="noopener" href="${u}">${n}</a>`).join('')}</nav>
<p>בחרו כלי צ׳אט אחד. אל תירשמו למנוי בתשלום. אם יש חסימה או מגבלה, השתמשו בכלי אחר או עבדו בזוג. NotebookLM עשוי להופיע בשם Gemini Notebook בחשבון שלכם.</p>
<h2>חומרי התרגול</h2><p>להעלאה ל־NotebookLM: שמרו את קובצי א וב מאותה תיקייה. אפשר גם להעתיק את הטקסט מהסעיפים שלהלן.</p>
${Object.entries(sources).map(([k,v])=>`<details><summary>${esc(v.split('\n')[0])}</summary><button onclick="copyText('source-${k}',this)">העתקת המסמך</button><pre id="source-${k}">${esc(v)}</pre></details>`).join('')}
<h2>התרגילים</h2><table><tr><th>תרגיל</th><th>מה עושים</th><th>מה שומרים</th></tr>
<tr><td>1 · כתיבה</td><td>P02 לרפואה, P03 למנהלה או P04 להוראה. אחר כך P05 ו־P06.</td><td>טיוטה, שיפור ושני פרטים שבדקתם</td></tr>
<tr><td>2 · חיפוש</td><td>P08 או P09. פותחים שני מקורות.</td><td>גוף, קישור, תאריך או ״לא נמצא״</td></tr>
<tr><td>3 · מקורות</td><td>מעלים א וב, ואז P10 ו־P11. אם נשאר זמן P12.</td><td>פרט מעודכן, ציטוט ומידע חסר</td></tr>
<tr><td>4 · סוכן</td><td>P13 למנהלה או P15 לרפואה, סיעוד והוראה; Manus או חלופה בצ׳אט.</td><td>בדיקות, אחריות וטיוטת הודעה</td></tr>
<tr><td>הרחבה / בית</td><td>P14, ובדיקת עמית.</td><td>הודעה מעודכנת עם מקור השינוי</td></tr></table>
<h2>הפרומפטים להעתקה</h2><p>הפרומפטים עם מקור כוללים כבר את חומר התרגול. פרומפטי שיפור ובדיקה ממשיכים באותה שיחה. ב־NotebookLM מוסיפים תחילה את המסמכים.</p>
${prompts.map(p=>`<section id="${p.id}"><h2>${p.id} · ${esc(p.title)}</h2><p>${esc(p.tool)}${p.purpose?' · '+esc(p.purpose):''}</p><button onclick="copyText('text-${p.id}',this)">העתקת פרומפט</button><pre id="text-${p.id}">${esc(p.text)}</pre><details><summary>מה לבדוק בתוצאה</summary><p>${esc(p.check)}</p></details></section>`).join('')}
<h2>מטלת בית</h2><p>בחרו משימה מקצועית אחת: חפשו מקור פומבי, ארגנו את המידע והפיקו הודעה, הסבר או סיכום. אפשר להשתמש גם במסמכים הפיקטיביים מהמפגש. אין חובה למנוי ואין לעבוד על מידע רגיש.</p><pre>התפקיד שלי:
המשימה שבחרתי:
הכלי שבו השתמשתי:
המקור וקישור אליו:
הפרומפט שכתבתי:
התוצר שהתקבל:
שתי בדיקות שביצעתי:
תיקון שביצעתי ולמה:
שאלה למפגש הבא:</pre>
<h2>מקורות לעיון</h2><p>הכלים והגישה החינמית עשויים להשתנות. נבדק לקראת המפגש, 12.10.2026.</p><ul>${Object.entries({הנחיות_WHO_על_AI_בבריאות:links.whoAI,הנחיית_WHO_להיגיינת_ידיים_2009:links.whoHands,העלאת_קבצים_ב_ChatGPT:links.freeChat,מסלולי_Claude:links.freeClaude,עזרת_NotebookLM:links.notebookHelp,מסלולי_Manus:links.freeManus,הבדלי_Copilot:links.microsoft}).map(([n,u])=>`<li><a href="${u}" target="_blank" rel="noopener">${n.replaceAll('_',' ')}</a></li>`).join('')}</ul>
<p>כפיר משה יעקובי · <a href="mailto:cfir94@gmail.com">cfir94@gmail.com</a> · <span dir="ltr">052-656-8094</span></p></main><script>async function copyText(id,button){const value=document.getElementById(id).textContent;try{await navigator.clipboard.writeText(value)}catch{const t=document.createElement('textarea');t.value=value;document.body.append(t);t.select();const ok=document.execCommand('copy');t.remove();if(!ok){button.textContent='סמנו את הטקסט והעתיקו';return}}button.textContent='הועתק';setTimeout(()=>button.textContent='העתקה',1800)}</script></html>`;
await fs.writeFile(path.join(output,'תרגילים ופרומפטים - מפגש 1.html'),handbook);
await fs.writeFile(path.join(output,'פרומפטים - מפגש 1.txt'),'\ufeff'+prompts.map(p=>`${p.id} — ${p.title}\nכלי: ${p.tool}\n\n${p.text}\n\nבדיקה: ${p.check}\n\n${'='.repeat(45)}`).join('\n\n'));
const guide=`# מדריך למרצה — מפגש 1

קהל: 11 משתתפים מרפואה ואדמיניסטרציה, ללא מנוי לכלים. משך: שלוש שעות כולל הפסקה של 15 דקות. הערות מפורטות ופרומפטים גם בתוך PowerPoint, בחלונית הערות או בתצוגת מגיש.

## הכנה לפני המפגש

- לפתוח את המצגת במחשב שממנו מציגים ולנסות את תצוגת המגיש.
- לפתוח את דף התרגילים המקומי ולשלוח אותו ואת שלושת קובצי המקור למשתתפים.
- לוודא אינטרנט, מקרן, חשמל וכניסה לכלי צ׳אט אחד, NotebookLM ו־Manus בחשבון המרצה.
- להריץ מראש P02, P10 ו־P13 ולשמור דוגמה למקרה של חסימה. אין צורך להבטיח תוצר אחיד בין הרצות.
- להציג תרגול על מידע פיקטיבי בלבד. מדיניות הארגון לשימוש אמיתי אינה נקבעת במפגש.
- לא לבקש מהמשתתפים להירשם למנוי או למסור פרטי תשלום.

## תזמון

| זמן | יחידה | שקפים |
| --- | --- | --- |
${blocks.map(b=>`| ${b.time} | ${b.title} | ${b.slides} |`).join('\n')}

## מסלול גיבוי

- כלי צ׳אט חסום: כלי אחר או עבודה בזוג. 11 משתתפים: ארבעה זוגות וקבוצה של שלושה אם רוצים עבודה משותפת לכולם.
- חיפוש בתשלום: חיפוש רגיל בדפדפן. קישור WHO הציבורי בדף התרגול.
- NotebookLM חסום: הדבקת א וב לכלי צ׳אט, בקשת שם מסמך וסעיף ופתיחת המקור ידנית.
- Manus ללא קרדיטים: P13 בכלי צ׳אט, תוצר אחד בכל פעם. להסביר שהחלופה מתרגלת תכנון ובקרה, ואינה מדגימה את ביצוע הכלים האוטונומי.
- אינטרנט נופל: קריאה ידנית של המסמכים ובדיקת הטיוטה המוכנה שלהלן. לאחר מכן כותבים פרומפט מקומי ומשווים בין זוגות.

## טיוטת גיבוי ופתרון לתרגיל המסכם

זו דוגמה מוכנה שנכתבה לצורך הוראה, לא תוצאה שהתקבלה בפועל מכלי.

שלום, ביום רביעי יתקיים מפגש הדרכה למטופלים ולמלווים על תהליך ההגעה למרפאה. המפגש יתחיל בשעה 09:30 בחדר 3; אנא הגיעו ב־09:15 והביאו את הודעת הזימון. משך המפגש 45 דקות וההשתתפות ללא תשלום. אם נדרש סיוע בשפה או בנגישות, פנו מראש למרכז ההדרכה בערוץ הפנייה שבהודעת הזימון.

בדיקה: מסמך ב סעיף 2 קובע 09:30, חדר 3 והגעה 09:15; סעיף 1 מחליף במפורש את סעיף 2 של א. מסמך א סעיף 3 קובע 45 דקות וללא תשלום, וסעיפים 4–5 מתארים זימון וסיוע. אין טלפון או הנחיית צום.

טיוטה שגויה לזיהוי טעויות, לשימוש רק אם אין אינטרנט: ״המפגש ביום רביעי ב־09:00 בחדר 3. הגיעו ב־08:45. להרשמה התקשרו 04-0000000. יש לצום שש שעות לפני ההגעה.״

פתרון: שעה והגעה ישנות; חדר מעודכן מעורב עם שעה ישנה; מספר טלפון מומצא; הוראת צום שאינה במסמכים. אין להשתמש בטיוטה שגויה כהודעה אמיתית.

## בדיקת תרגילים

- P02: 09:00, חדר 2, הגעה 08:45; מידע חסר מסומן.
- P03: רכזת פותחת חדר ומתעדת נוכחות; מחשוב בודק ציוד; מרצה שולח חומרים. אין SLA.
- P04: שאלות נתמכות בסעיף ושאלה חסרה נשארת חסרה.
- חיפוש: גוף מפרסם, תאריך אמיתי וקישור שנפתח; מקור ישן אינו מוצג כעדכון חדש.
- P10 ו־P14: פרטי הזמן המעודכנים ממסמך ב; ציטוט נכון.
- P11: אין טלפון ואין הוראות צום. ״לא נמצא״ אינו המלצה קלינית.
- P13: התוצרים עקביים; אין שליחה, רכישה או המצאת מדיניות.

## אם מתעכבים

שומרים על ההפסקה ועל סיום ב־03:00. מקצרים את סקירת הכלים, משאירים רק משתתף אחד בשיתוף ומדגימים Manus במקום לרוץ ב־11 חשבונות. אין לוותר על בדיקת המקורות, זיהוי חסר ומטלת הבית. התרגיל המסכם יכול להפוך להמשך עבודה בבית אם הזמן אינו מספיק.

## הצגה והעתקת פרומפטים

ההנפשות עדינות ופועלות ב־F5. רשימות נחשפות בלחיצה. הנוסחים שעל המסך קצרים; בדף התרגול ובהערות PowerPoint נמצאים הפרומפטים המלאים עם המקורות וכפתורי העתקה. אם התצוגה המקדימה הופכת מילים, פתחו את PowerPoint או את ה־PDF שיוצא ממנו.

## מפת המשך הקורס

1. המפגש הזה: כלי צ׳אט, פרומפטים, חיפוש, מקורות וסוכנים.
2. נתונים ועוזרים אישיים: קובץ פיקטיבי לניתוח, בדיקת חישובים ועוזר עם גבולות והנחיות קבועות. לבניית עוזר ייעודי עשויים להיות תנאי גישה; אפשר לתרגל הנחיות קבועות בשיחה ללא מנוי.
3. מדיה: תכנון תוכן, תמונה וקול או וידאו, ואז מצגת קצרה. קבעו מראש חלופות בלי קרדיטים.
4. אב־טיפוס קטן, בדיקה והצגת תוצרים; אין לבנות כלי שמקבל החלטות קליניות.
5. Claude מתקדם: רק אם סוכם המפגש האופציונלי ויש גישה מתאימה.

רק מפגש 1 מוכן להעברה בערכה הזו. המפה אינה מצגת מוכנה למפגשים 2–5.
`;
await fs.writeFile(path.join(output,'מדריך למרצה - מפגש 1.md'),guide);
console.log('Course kit ready:',output);
