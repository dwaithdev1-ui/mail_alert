import zipfile
import xml.etree.ElementTree as ET
import os

def docx_to_text(docx_path):
    try:
        with zipfile.ZipFile(docx_path) as z:
            xml_content = z.read('word/document.xml')
            root = ET.fromstring(xml_content)
            
            # XML namespace for Word
            ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            
            text = []
            for p in root.findall('.//w:p', ns):
                p_text = []
                for r in p.findall('.//w:r', ns):
                    t = r.find('w:t', ns)
                    if t is not None and t.text:
                        p_text.append(t.text)
                if p_text:
                    text.append(''.join(p_text))
            return '\n'.join(text)
    except Exception as e:
        return f"Error extracting text: {e}"

if __name__ == '__main__':
    doc_path = r'c:\Projects\mail_alert\Mail_Alert_System_Documentation.docx'
    if os.path.exists(doc_path):
        content = docx_to_text(doc_path)
        print("--- DOCX CONTENT ---")
        print(content[:10000])  # print first 10k characters
        print("--- END ---")
    else:
        print(f"File not found: {doc_path}")
