import sys
import pdfplumber
from openpyxl import Workbook

if len(sys.argv) != 3:
    raise SystemExit('Usage: pdf_to_excel.py input.pdf output.xlsx')

source, destination = sys.argv[1], sys.argv[2]
wb = Workbook()
ws = wb.active
ws.title = 'PDF Tables'
found = 0
with pdfplumber.open(source) as pdf:
    for page_no, page in enumerate(pdf.pages, start=1):
        tables = page.extract_tables() or []
        for table_no, table in enumerate(tables, start=1):
            if not table:
                continue
            if found:
                ws = wb.create_sheet(title=f'Page{page_no}_Table{table_no}'[:31])
            else:
                ws.title = f'Page{page_no}_Table{table_no}'[:31]
            for row in table:
                ws.append([(cell or '').strip() if isinstance(cell, str) else cell for cell in row])
            found += 1
if not found:
    ws['A1'] = 'No structured tables were detected in this PDF.'
    ws['A2'] = 'Try OCR first if the document is a scan, or use PDF to Word / PDF to Text.'
wb.save(destination)
