"""Create the handoff archive and a browser-readable instructor guide."""
from pathlib import Path
from html import escape
import zipfile, sys

sys.stdout.reconfigure(encoding='utf-8')
focused='--focused' in sys.argv
out=Path('output/bnei-zion-session-01-focused' if focused else 'output/bnei-zion-session-01')
deck='המעבר מצ׳אט לסוכן - מפגש ראשון - גרסה ממוקדת.pptx' if focused else 'בינה מלאכותית בעבודה שלכם - מפגש ראשון - מלוטש.pptx'
guide=out/'מדריך למרצה - מפגש 1.md'
lines=guide.read_text(encoding='utf-8').splitlines()
html=[]
i=0
while i<len(lines):
    line=lines[i]
    if line.startswith('# '):html.append('<h1>'+escape(line[2:])+'</h1>')
    elif line.startswith('## '):html.append('<h2>'+escape(line[3:])+'</h2>')
    elif line.startswith('|'):
        html.append('<table>')
        while i<len(lines) and lines[i].startswith('|'):
            cells=[x.strip() for x in lines[i].split('|')[1:-1]]
            if not all(set(x)<=set('- :') for x in cells):
                html.append('<tr>'+''.join('<td>'+escape(x)+'</td>' for x in cells)+'</tr>')
            i+=1
        html.append('</table>');continue
    elif line.startswith('- '):html.append('<p class="item">'+escape(line[2:])+'</p>')
    elif line.strip():html.append('<p>'+escape(line)+'</p>')
    i+=1
style='body{font:19px/1.8 Arial;background:#f7f8fc;color:#191b2b;margin:0}main{max-width:980px;margin:auto;padding:40px 28px}h1,h2{color:#7a59bc}h2{margin-top:46px}table{border-collapse:collapse;width:100%}td{padding:10px;border-bottom:1px solid #dce1ef}.item{padding-right:16px;border-right:3px solid #4378ab}'
(out/'מדריך למרצה - מפגש 1.html').write_text('<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>מדריך למרצה</title><style>'+style+'</style><main>'+''.join(html)+'</main></html>',encoding='utf-8')
start='''<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ערכת מפגש ראשון</title><style>body{font:22px/1.8 Arial;background:#f7f8fc;color:#191b2b;max-width:950px;margin:60px auto;padding:24px}h1{color:#7a59bc}a{color:#4378ab}li{margin:20px 0}</style><h1>בינה מלאכותית בעבודה שלכם</h1><p>ערכת מפגש ראשון לשלוש שעות, כולל הפסקה ותרגול.</p><ol><li><a href="בינה מלאכותית בעבודה שלכם - מפגש ראשון.pptx">מצגת PowerPoint לעריכה ולהצגה</a></li><li><a href="מדריך למרצה - מפגש 1.html">מדריך המרצה והתזמון</a></li><li><a href="תרגילים ופרומפטים - מפגש 1.html">דף התרגול וכפתורי העתקת הפרומפטים</a></li><li><a href="בינה מלאכותית בעבודה שלכם - מפגש 1.pdf">PDF לגיבוי</a></li></ol><p>מסמכים א וב מיועדים לתרגיל NotebookLM. מסמך ג לתרגיל המנהלי. כל התרחישים פיקטיביים.</p><p>הערות המרצה נמצאות גם בתוך ה־PowerPoint בחלונית הערות ובתצוגת מגיש.</p></html>'''
start=start.replace('בינה מלאכותית בעבודה שלכם - מפגש ראשון.pptx',deck)
if focused:
    start=start.replace('בינה מלאכותית בעבודה שלכם - מפגש 1.pdf','המעבר מצ׳אט לסוכן - מפגש ראשון.pdf')
    start=start.replace('בינה מלאכותית בעבודה שלכם','המעבר מצ׳אט לסוכן')
    start=start.replace('ערכת מפגש ראשון לשלוש שעות, כולל הפסקה ותרגול.','32 שקפים בשבעה סקשנים. שלוש שעות כולל הפסקה ותרגול. 15 פרומפטים מוכנים להעתקה; שתי דוגמאות סוכן לבחירה.')
    start=start.replace('</html>','<p>הסרטון בשקף 29 נמצא בתיקיית videos. השאירו אותה לצד המצגת והפעילו מתוך הקישור בשקף. חלצו את כל הערכה לפני פתיחת המצגת.</p></html>')
start=start.replace('הערות המרצה נמצאות', 'ההנפשות פועלות בתצוגת מצגת (F5). לחיצה חושפת רעיון נוסף, ולאחר החשיפה מעבירה שקף. ה־PDF הוא גיבוי סטטי. הערות המרצה נמצאות')
(out/'פתחו כאן.html').write_text(start,encoding='utf-8')
files=[p for p in out.iterdir() if p.is_file() and (p.name==deck or p.suffix in {'.pdf','.txt','.md','.html'})]
assert (out/deck).exists()
assert len(files)==10,[(p.name,p.stat().st_size) for p in files]
archive=out.parent/('בני ציון - ערכת מפגש ממוקד.zip' if focused else 'בני ציון - ערכת מפגש ראשון.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for p in files:z.write(p,p.name)
    if focused:
        video=out/'videos/figure-03-home.mp4'
        assert video.exists()
        z.write(video,'videos/figure-03-home.mp4')
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
print('Packaged',len(files),'files;',archive.stat().st_size,'bytes')
