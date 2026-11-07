import sys
from pdf2image import convert_from_path
from pptx import Presentation
from pptx.util import Inches

if len(sys.argv) != 3:
    raise SystemExit('Usage: pdf_to_powerpoint.py input.pdf output.pptx')

source, destination = sys.argv[1], sys.argv[2]
prs = Presentation()
prs.slide_width = Inches(10)
prs.slide_height = Inches(7.5)
blank = prs.slide_layouts[6]
images = convert_from_path(source, dpi=120, fmt='png')
for image in images:
    slide = prs.slides.add_slide(blank)
    from io import BytesIO
    buf = BytesIO()
    image.save(buf, format='PNG')
    buf.seek(0)
    ratio = min(prs.slide_width / image.width, prs.slide_height / image.height)
    width = int(image.width * ratio)
    height = int(image.height * ratio)
    left = int((prs.slide_width - width) / 2)
    top = int((prs.slide_height - height) / 2)
    slide.shapes.add_picture(buf, left, top, width=width, height=height)
prs.save(destination)
