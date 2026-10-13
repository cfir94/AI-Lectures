"""Set Hebrew paragraph direction in an Artifact Tool-produced PPTX."""
import sys, zipfile, re
from pathlib import Path
from xml.etree import ElementTree as ET
p=Path(sys.argv[1])
ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main'}
ET.register_namespace('a',ns['a'])
with zipfile.ZipFile(p) as z:
    files={info.filename:(info,z.read(info.filename)) for info in z.infolist()}
for name,(info,data) in list(files.items()):
    if re.fullmatch(r'ppt/theme/theme\d+\.xml',name):
        tree=ET.fromstring(data)
        for key,colour in [('hlink','4378AB'),('folHlink','7A59BC')]:
            container=tree.find('.//a:clrScheme/a:'+key,ns)
            if container is not None:
                for child in list(container):container.remove(child)
                ET.SubElement(container,'{'+ns['a']+'}srgbClr',{'val':colour})
        files[name]=(info,ET.tostring(tree,encoding='utf-8',xml_declaration=True))
    if re.fullmatch(r'ppt/(slides/slide\d+|notesSlides/notesSlide\d+)\.xml',name) and '--paragraphs-only' in sys.argv:
        # Preserve native transition AlternateContent prefixes and animation trees.
        # Re-serializing those namespaces can invalidate mc:Choice Requires.
        def set_direction(match):
            para=match.group(0)
            if not re.search('[\u0590-\u05ff]',para):return para
            if re.search(r'<a:pPr\b',para):
                def prop(m):
                    tag=m.group(0)
                    if re.search(r'\brtl=',tag):return re.sub(r'\brtl="[^"]*"','rtl="1"',tag)
                    return tag.replace('<a:pPr','<a:pPr rtl="1"',1)
                return re.sub(r'<a:pPr\b[^>]*>',prop,para,count=1)
            return para.replace('<a:p>','<a:p><a:pPr rtl="1"/>',1)
        data=re.sub(r'<a:p(?:\s[^>]*)?>.*?</a:p>',set_direction,data.decode('utf-8'),flags=re.S).encode('utf-8')
        files[name]=(info,data)
    elif re.fullmatch(r'ppt/(slides/slide\d+|notesSlides/notesSlide\d+)\.xml',name):
        tree=ET.fromstring(data)
        for para in tree.findall('.//a:p',ns):
            text=''.join(t.text or '' for t in para.findall('.//a:t',ns))
            if re.search('[\u0590-\u05ff]',text):
                props=para.find('a:pPr',ns)
                if props is None:
                    props=ET.Element('{'+ns['a']+'}pPr');para.insert(0,props)
                props.set('rtl','1')
        files[name]=(info,ET.tostring(tree,encoding='utf-8',xml_declaration=True))
with zipfile.ZipFile(p,'w',zipfile.ZIP_DEFLATED) as z:
    for info,data in files.values():z.writestr(info,data)
print('Hebrew paragraphs set to RTL')
