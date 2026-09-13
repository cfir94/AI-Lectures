# המשך עבודה

עודכן ב־2026-09-12. לקרוא את AGENTS.md ואת LECTURE-FLOW.md לפני שינוי הרצף.

## מצב נוכחי

- 59 שקפים במסמך: 38 מוצגים ו־21 מוסתרים. שלושת שקפי הסיום הקודמים נשמרו כמוסתרים; לא נמחקו שקפים.
- שולבו עדכוני GitHub עד e7ee969, כולל תיקוני התנועה וצביעת מילים מפוצלות.
- שקפים 18–20 הוחלפו בהסבר שיחה, הצגת סוכן והמחשת תיאום פגישה אינטראקטיבית. המועד שנבחר מופיע בטיוטה; אפשר לשנות בחירה, לחזור מהאישור לבדיקה ולאפס. אין חיבור לכלים אמיתיים.
- צילום BBC על מטא הוטמע ראשון בכתבות. ארבע הכתבות הנוספות משתמשות בפריסה שמפרידה בין צילום לכותרת.
- ארבע התמונות החדשות מוטמעות ב־3200×1800 וצילום BBC ב־2400px. המסמך נשאר בתוך מגבלת הייצוא הקיימת.
- הסיום החדש: משימה אחת למחר, אחריות אנושית וחזרה לשאלת 2030 עם תמונת הסיום שסופקה. התודה נשארת אחרונה.

## בדיקות

- הבנייה ו־49 בדיקות היחידה עברו.
- tools/browser-runtime.mjs מאפשר לבדיקה ולהטמעת התמונות לפעול גם ב־Windows באמצעות Playwright המותקן בסביבה, ללא תלות חדשה במצגת או בבנייה.
- tools/agent-flow-qa.mjs בודק בחירה ושינוי מועד, טיוטה, אישור מפורש, חזרה לבדיקה, איפוס, מקלדת, עורך, ייצוא HTML עצמאי, מסך צר וכל סוגי השקפים.
- tools/stage-audit.mjs בודק את הרצף המוצג: תמונות, טקסט, חיתוך תיבות, פאנלים ושגיאות דפדפן. תוצרי QA נשמרים ב־.cache ואינם בגיט.

## נותר לחזרת המרצה

- [ ] **לאשר שרוח הרפאים של ״מילה אחרי מילה״ נעלמה.** לא ניתן לשחזר כאן: שקף 12 ושקף 3 שניהם מרונדרים נקיים בכל פריים, ועם המסמך של המרצה עצמו. ההסבר שנותר הוא ניקוי פיקסלים שגוי סביב מילה שנושאת טרנספורם ומציירת גרדיאנט דרך אותיות שקופות — תלוי GPU ופונט, ואצלי ה־stack נופל מ־Segoe UI. הוקשח ב־CSS; צריך עין על המחשב שלו כדי לדעת אם זה נסגר.

- **רענון קשיח בדפדפן (Ctrl+Shift+R).** הקשקוש שדווח בשקף 3 לא שוחזר. ה־JSON של המרצה נבדק מול הריפו ב־`tools/apply-export.mjs` — ארבעה הבדלים בלבד, כולם שינוי ה־cascade שהוא עשה, וכל ה־`bind` במקומם. המסמך שלו נטען כמו שהוא לבנייה הנוכחית ורונדר נקי פריים אחר פריים ובשלושה יחסי מסך, כולל 2000x977 שהוא היחס של הצילום שלו. ההסבר הסביר היחיד שנשאר הוא עותק ישן של האפליקציה ב־cache.

- לעבור על הניסוחים החדשים ולהתאמן בהמחשה לפני ההרצאה. כל מטרה, פעולה, אפשרות ותוצאה ניתנות לעריכה בכרטיס השקף.
- אם קיימות עריכות נוספות בדפדפן, לייצא JSON ולהשוות באמצעות tools/apply-export.mjs לפני החלפה. רענון אינו מוחק עותק מקומי.
- הסרטונים לא נוגנו מחדש בסבב הזה. לבדוק במחשב ההצגה עם dist/videos. השקף lecture-agent-motion נשאר מוסתר עד שסופק הווידאו המתאים.
- להתאים דוגמאות ופרומפטים לקהל, ולבצע את ההדגמות החיות בכלים האמיתיים.

## שמירה ופרסום

לבנות ולבדוק לפני קומיט; dist/index.html נשאר בגיט. דחיפה ל־main מפעילה GitHub Pages. אם מופיעה הודעת גרסה חדשה בדפדפן, לבחור בטעינתה כדי לראות את התוכן החדש; העותק הקודם נשמר כטיוטה. Sites הוא ערוץ נפרד ולא פורסם בסבב הזה.

## 2026-09-13 — backdrop follow-up

Fixed the hidden atmosphere during the Gemini sequence using an immediately visible shared frame and content-only wait. Dedicated browser regression: tools/backdrop-continuity-qa.mjs. No lecture content changed.

2026-09-13: Added six supplied icons and reliability slide. Current count: 61 total, 36 shown, 25 hidden; see LECTURE-FLOW.md.

Tool purpose icons moved beside the tool names; agenda icons unchanged. Duplicate Gemini during transitions fixed and frame-sampled.

Slide 20 human approval now demonstrates a wrong price and explicit approval of the correction. Rehearse the two interactive beats.

2026-09-13: PDF export added; use Save as PDF in the print dialog. Regression tools: pdf-export-qa.mjs and cascade-paint-qa.mjs. Agent video autoplay verified locally; Pages still needs the video file selected locally because local media is deliberately not committed. Check cascade on the presenter’s GPU during rehearsal; browser regression is clean.
