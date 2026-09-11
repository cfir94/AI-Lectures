/* September 12 content pass. Idempotent: keep original finale slides hidden. */
import {readFile, writeFile} from 'node:fs/promises';
import '../src/core.js';
const C = globalThis.LectureCore;
const file = new URL('../src/content.json', import.meta.url);
const deck = JSON.parse(await readFile(file, 'utf8'));
const find = id => deck.slides.find(s => s.id === id);
function statement(id, title, accent, caption, palette='pearl') {
  return {...C.blankSlide('statement'), id, title, accent, caption, palette, visibility:'shown',
    backdrop:'plain', transition:'cut', motion:'blur', scale:'large', objects:[]};
}
function bound(slide, field, y, height, size, style='solid') {
  const object = {...C.blankObject('text'), id: `${slide.id}-${field}`, bind:field, text:slide[field],
    x:'55', y:String(y), width:'39', height:String(height), fontSize:String(size),
    weight:'400', align:'right', color:'auto', style, entrance:'fade', exit:'none'};
  slide.objects.push(object);
}
const chat = statement('lecture-chatbot', 'צ׳אטבוט.', 'חושב איתכם.', 'מסביר, מנסח ומנתח בתוך השיחה.');
chat.note = 'כאן מדברים על מצב שיחה ללא כלים מחוברים. מוצרי צ׳אט יכולים לכלול גם מצבי פעולה; ההבחנה היא ביכולת ובהרשאה, לא בשם המוצר. הדימוי של הבועה מגיע מהמרצה.';
bound(chat,'title',28,15,58); bound(chat,'accent',45,18,65,'spectrum'); bound(chat,'caption',68,12,23);
Object.assign(find(chat.id),chat);
delete find(chat.id).sides;
const agent = statement('lecture-agent-demo','נותנים מטרה.','הסוכן מפעיל כלים.','מתכנן, מבצע ובודק את התוצאה.','prism');
agent.backdrop='orbit'; agent.motion='zoom'; agent.transition='zoom';
agent.note='סוכן תוכנה מפעיל כלים במסגרת הגישה וההרשאות שהוגדרו לו. הוא עשוי לחזור על פעולה או לשנות תוכנית בעקבות תוצאה. זה אינו מבטיח הצלחה. בהמשך מפעילים המחשה מקומית לתיאום פגישה.';
Object.assign(find(agent.id),agent);
const lab = find('lecture-agent-anatomy');
Object.assign(lab,{type:'agent', title:'תאמו לי פגישה עם דנה', caption:'20 דקות השבוע · מטרה אחת, כמה כלים',
  palette:'pearl', backdrop:'plain', motion:'rise', transition:'cut', scale:'auto', objects:[],
  note:'המחשה מקומית ומוגדרת מראש, ללא חיבור ליומן או שליחת הזמנה. מפעילים כלי, בוחרים מועד, מכינים טיוטה, בודקים ועוצרים לאישור. בחירה משנה את התוצר. בכוונה אפשר לחזור מהאישור לבדיקה. חצים חוזרים בין שלבים; הפעלה חוזרת מאפסת את הבחירה.',
  items:[
    {word:'מתכנן.',caption:'מפרק את הבקשה לפעולות שאפשר לבצע.',tool:'תוכנית עבודה',kind:'run',action:'בניית תוכנית',result:'זמינות ← טיוטה ← בדיקה ← אישור',first:'',second:''},
    {word:'מוצא זמן.',caption:'קורא יומנים מורשים ומציע מועדים פנויים.',tool:'יומן',kind:'choose',action:'בחירת מועד',result:'נבחר מועד: {בחירה}',first:'שלישי · 10:00',second:'רביעי · 14:30'},
    {word:'מכין הזמנה.',caption:'משתמש במועד שבחרתם כדי להכין תוצר.',tool:'טיוטת הזמנה',kind:'run',action:'הכנת טיוטה',result:'פגישה עם דנה\n{בחירה} · 20 דקות\nסטטוס: טיוטה',first:'',second:''},
    {word:'בודק את עצמו.',caption:'בודק שהזמן, המשתתפים והמשך תואמים לבקשה.',tool:'בדיקת התוצאה',kind:'run',action:'בדיקת ההזמנה',result:'דנה · 20 דקות · {בחירה}\nהפרטים תואמים. ההזמנה עדיין לא נשלחה.',first:'',second:''},
    {word:'עוצר לאישור.',caption:'פעולה כלפי אדם אחר נשארת בשליטה שלכם.',tool:'אישור אנושי',kind:'approve',action:'אישור ההזמנה בהמחשה',result:'אושר: {בחירה}\nההמחשה הסתיימה. לא נשלחה הזמנה אמיתית.',first:'',second:''},
  ]});
delete lab.composition;
const article=find('lecture-agents-work-article');
Object.assign(article,{visibility:'shown',title:'אחת מכל עשר משרות.',caption:'Meta · קיצוצים והשקעה ב־AI · BBC, 24.04.2026',
  alt:'צילום כתבת BBC: מטא מקצצת אחת מכל עשר משרות אחרי הוצאות של מיליארדים על AI',
  link:'https://www.bbc.com/news/articles/crm1y89vek8o',
  note:'מקור: צילום BBC שסיפק המרצה, מתאריך 24 באפריל 2026. המסמך המצורף מציין כ־8,000 משרות ותוכנית השקעה של 135 מיליארד דולר. צילום הכותרת מציג קיצוצים לצד השקעה ב־AI; הוא אינו מוכיח שכל המשרות הוחלפו בסוכנים. זה הגשר משיחה על סוכנים לשינוי בארגונים.'});
for(const id of ['lecture-agents-work-article','lecture-nobel','lecture-singapore','lecture-reuters','lecture-aitana']) {
  Object.assign(find(id),{imageLayout:'editorial',palette:'pearl',backdrop:'plain',fit:'contain',motion:'still'});
}
article.transition='cut';
for(const id of ['lecture-start-today','lecture-what-remains','lecture-revolution']) find(id).visibility='hidden';
const start={...C.blankSlide('number'),id:'lecture-finale-one-task',visibility:'shown',value:'1',unit:'משימה למחר',
 title:'מתחילים קטן.',caption:'משהו שחוזר על עצמו. תוצאה שאפשר לבדוק.',palette:'pearl',backdrop:'plain',motion:'zoom',transition:'cut',
 note:'לבקש מכל אחד לבחור משימה אמיתית לשבוע הקרוב: ניסוח, חיפוש, ניתוח או הכנת טיוטה עם כלי. להתנסות, לבדוק את התוצר ורק אז להרחיב. אין צורך להתחייב למוצר או מנוי מסוים.'};
const responsibility=statement('lecture-finale-responsibility','הסוכן מבצע.','אתם אחראים.','מגדירים גבולות. בודקים תוצאה. מאשרים פעולה.','violet');
responsibility.backdrop='halo'; responsibility.transition='cut';
responsibility.note='לעצור על האחריות: שיקול דעת, בחירה ואישור הם חלק מתהליך העבודה עם AI. הסיום אינו הבטחה שהמערכת יכולה לעשות הכול.';
const future=statement('lecture-finale-future','2030 מתחילה','בבחירה של היום.','מה תבחרו לנסות מחר?');
bound(future,'title',27,14,55); bound(future,'accent',43,23,63,'spectrum'); bound(future,'caption',71,9,25);
future.note='חזרה לשאלת הפתיחה: איך ייראה עולם העבודה שלכם ב־2030? אין לנו תחזית ודאית, אבל יש לנו בחירה מה ללמוד ומה לנסות. לתת לקהל רגע לחשוב לפני שעוברים לתודה.';
const additions=[start,responsibility,future];
for(const s of additions) { const old=find(s.id); if(old) Object.assign(old,s); }
const missing=additions.filter(s=>!find(s.id));
deck.slides.splice(deck.slides.findIndex(s=>s.id==='lecture-thanks'),0,...missing);
await writeFile(file,JSON.stringify(deck,null,2)+'\n');
console.log('Updated agents, article layouts and three replacement closing slides.');
