import sys
from pdf2docx import Converter

if len(sys.argv) != 3:
    raise SystemExit('Usage: pdf_to_word.py input.pdf output.docx')

source, destination = sys.argv[1], sys.argv[2]
converter = Converter(source)
try:
    converter.convert(destination, start=0, end=None)
finally:
    converter.close()
