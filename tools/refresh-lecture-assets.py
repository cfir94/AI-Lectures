"""One-off import of the presenter's September 12 artwork, without upscaling.
Usage: bundled-python tools/refresh-lecture-assets.py <media-directory>
Raster encoding only: preserve composition and store every asset in the deck.
"""
import sys, json, base64, io
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
media = Path(sys.argv[1])
deck_path = root / 'src/content.json'
deck = json.loads(deck_path.read_text(encoding='utf-8'))
def encode(file, width=3200, quality=90):
    im = Image.open(file)
    im.thumbnail((width, width), Image.Resampling.LANCZOS)
    out = io.BytesIO()
    im.save(out, format='WEBP', quality=quality, method=6)
    print(file.name, im.size, len(out.getvalue()))
    return 'data:image/webp;base64,' + base64.b64encode(out.getvalue()).decode()

jobs = [
 ('lecture-open', 'תמונות לשקפים/שקף פתיחה באיכות הכי גבוהה.png'),
 ('lecture-model-intro', 'תמונות לשקפים/שקף 7 מודל שפה גדול באיכות הכי גבוהה.png'),
 ('lecture-chatbot', "תמונות לשקפים/תמונת צ'אט באיכות הכי גבוהה.png"),
 ('lecture-finale-future', 'תמונות לשקפים/תמונה יפה לאחד מהשקפים האחרונים באיכות הכי גבוה.png'),
]
for slide_id, filename in jobs:
    slide = next(s for s in deck['slides'] if s['id'] == slide_id)
    slide['backdrop'] = 'picture'
    slide['backdropPicture'] = encode(media / filename)
article = next(s for s in deck['slides'] if s['id'] == 'lecture-agents-work-article')
article['picture'] = encode(media / 'צילומי מסך מכתבות/מטא מקצצת אחד מכל עשרה, ומוציאה 135 מיליארד דולר על AI.png', 2400, 87)

# Existing PNG/JPEG assets can be losslessly dimension-preserved while using
# a much smaller WebP encoding. Skip anything already in WebP and never replace
# an asset unless the result is smaller. This keeps the portable budget intact.
def compact(obj):
    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(value, str) and value.startswith(('data:image/png;', 'data:image/jpeg;')):
                im = Image.open(io.BytesIO(base64.b64decode(value.split(',')[1])))
                out = io.BytesIO(); im.save(out, format='WEBP', quality=92, method=6)
                uri = 'data:image/webp;base64,' + base64.b64encode(out.getvalue()).decode()
                if len(uri) < len(value): obj[key] = uri
            else: compact(value)
    elif isinstance(obj, list):
        for item in obj: compact(item)
compact(deck)
deck_path.write_text(json.dumps(deck, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Portable bytes:', len(json.dumps(deck, ensure_ascii=False, separators=(',', ':')).encode()))
