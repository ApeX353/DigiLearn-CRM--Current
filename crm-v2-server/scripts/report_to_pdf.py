"""
Reusable PDF report generator for CRM scheduled tasks.
Usage: python scripts/report_to_pdf.py --title "Report Title" --subtitle "Subtitle" --body body.md --out "filename.pdf"

Reads a simple markdown-like format from stdin or --body file and produces a styled PDF
in ~/Desktop/CRM Reports/

Supported body format:
  # Section Heading
  ## Sub-heading
  ### Sub-sub-heading
  | col1 | col2 | col3 |   (table rows, first row = header)
  - bullet item
  > callout / highlight text
  Plain paragraph text
  ---                        (horizontal rule)
  [CRITICAL] or [HIGH] or [GOOD] prefix for colored labels
"""

import sys, os, argparse, re
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)

OUT_DIR = os.path.join(os.path.expanduser("~"), "Desktop", "CRM Reports")
os.makedirs(OUT_DIR, exist_ok=True)

# Colors
DARK_BLUE = HexColor("#1a365d")
MED_BLUE = HexColor("#2b6cb0")
LIGHT_BLUE = HexColor("#ebf4ff")
HEADER_BG = HexColor("#2d3748")
ROW_ALT = HexColor("#f7fafc")
BORDER = HexColor("#e2e8f0")
CRIT_RED = HexColor("#c53030")
WARN_ORANGE = HexColor("#c05621")
GOOD_GREEN = HexColor("#276749")
TEXT_DARK = HexColor("#2d3748")
TEXT_MED = HexColor("#718096")

styles = getSampleStyleSheet()

def _a(name, **kw):
    if name not in [s.name for s in styles.byName.values()]:
        styles.add(ParagraphStyle(name, **kw))

_a('RTitle', parent=styles['Title'], fontSize=20, textColor=DARK_BLUE, spaceAfter=2, fontName='Helvetica-Bold', alignment=TA_LEFT)
_a('RSub', parent=styles['Normal'], fontSize=9, textColor=TEXT_MED, spaceAfter=14, fontName='Helvetica')
_a('Sec', parent=styles['Heading1'], fontSize=14, textColor=DARK_BLUE, spaceBefore=14, spaceAfter=6, fontName='Helvetica-Bold')
_a('SubSec', parent=styles['Heading2'], fontSize=11, textColor=MED_BLUE, spaceBefore=10, spaceAfter=4, fontName='Helvetica-Bold')
_a('SubSubSec', parent=styles['Heading3'], fontSize=10, textColor=HexColor("#4a5568"), spaceBefore=8, spaceAfter=4, fontName='Helvetica-Bold')
_a('Body', parent=styles['Normal'], fontSize=9, textColor=TEXT_DARK, spaceAfter=6, fontName='Helvetica', leading=13)
_a('TCell', parent=styles['Normal'], fontSize=8, textColor=TEXT_DARK, fontName='Helvetica', leading=10)
_a('THdr', parent=styles['Normal'], fontSize=8, textColor=white, fontName='Helvetica-Bold', leading=10)
_a('Bullet', parent=styles['Normal'], fontSize=9, textColor=TEXT_DARK, fontName='Helvetica', leading=12, leftIndent=16, bulletIndent=6, spaceBefore=2, spaceAfter=2)
_a('Foot', parent=styles['Normal'], fontSize=7, textColor=TEXT_MED, fontName='Helvetica', alignment=TA_CENTER)
_a('CritLabel', parent=styles['Normal'], fontSize=9, textColor=CRIT_RED, fontName='Helvetica-Bold', spaceAfter=4)
_a('HighLabel', parent=styles['Normal'], fontSize=9, textColor=WARN_ORANGE, fontName='Helvetica-Bold', spaceAfter=4)
_a('GoodLabel', parent=styles['Normal'], fontSize=9, textColor=GOOD_GREEN, fontName='Helvetica-Bold', spaceAfter=4)
_a('Callout', parent=styles['Normal'], fontSize=9, textColor=MED_BLUE, fontName='Helvetica-Oblique', spaceAfter=6, leftIndent=12)


def make_table(rows):
    """Build a styled table from list of lists. First row = header."""
    if not rows or len(rows) < 2:
        return None
    hdr = [Paragraph(str(c).strip(), styles['THdr']) for c in rows[0]]
    data = [hdr]
    for r in rows[1:]:
        data.append([Paragraph(str(c).strip(), styles['TCell']) for c in r])
    ncols = len(rows[0])
    t = Table(data, repeatRows=1)
    cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, 0), 6),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 1), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 4),
    ]
    for i in range(1, len(data)):
        if i % 2 == 0:
            cmds.append(('BACKGROUND', (0, i), (-1, i), ROW_ALT))
    t.setStyle(TableStyle(cmds))
    return t


def parse_body(text):
    """Parse markdown-like body text into reportlab flowables."""
    story = []
    lines = text.split('\n')
    table_buf = []
    i = 0

    def flush_table():
        nonlocal table_buf
        if table_buf:
            rows = []
            for tl in table_buf:
                cells = [c.strip() for c in tl.strip('|').split('|')]
                # skip separator rows like |---|---|
                if all(re.match(r'^[-:]+$', c) for c in cells):
                    continue
                rows.append(cells)
            if rows:
                t = make_table(rows)
                if t:
                    story.append(t)
                    story.append(Spacer(1, 6))
            table_buf = []

    while i < len(lines):
        line = lines[i]

        # Table row
        if line.strip().startswith('|') and '|' in line.strip()[1:]:
            table_buf.append(line)
            i += 1
            continue
        else:
            flush_table()

        stripped = line.strip()

        # Empty line
        if not stripped:
            i += 1
            continue

        # Horizontal rule
        if stripped == '---' or stripped == '***':
            story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=8, spaceBefore=8))
            i += 1
            continue

        # Headings
        if stripped.startswith('### '):
            story.append(Paragraph(stripped[4:], styles['SubSubSec']))
            i += 1
            continue
        if stripped.startswith('## '):
            story.append(Paragraph(stripped[3:], styles['SubSec']))
            i += 1
            continue
        if stripped.startswith('# '):
            story.append(Paragraph(stripped[2:], styles['Sec']))
            i += 1
            continue

        # Colored labels
        if stripped.startswith('[CRITICAL]'):
            story.append(Paragraph(stripped[10:].strip(), styles['CritLabel']))
            i += 1
            continue
        if stripped.startswith('[HIGH]'):
            story.append(Paragraph(stripped[6:].strip(), styles['HighLabel']))
            i += 1
            continue
        if stripped.startswith('[GOOD]'):
            story.append(Paragraph(stripped[6:].strip(), styles['GoodLabel']))
            i += 1
            continue

        # Bullet
        if stripped.startswith('- ') or stripped.startswith('* '):
            story.append(Paragraph(f"&bull; {stripped[2:]}", styles['Bullet']))
            i += 1
            continue

        # Callout
        if stripped.startswith('> '):
            story.append(Paragraph(stripped[2:], styles['Callout']))
            i += 1
            continue

        # Regular paragraph
        story.append(Paragraph(stripped, styles['Body']))
        i += 1

    flush_table()
    return story


def hdr_footer(canvas_obj, doc, title):
    canvas_obj.saveState()
    canvas_obj.setStrokeColor(MED_BLUE)
    canvas_obj.setLineWidth(1.5)
    canvas_obj.line(30, A4[1]-30, A4[0]-30, A4[1]-30)
    canvas_obj.setFont('Helvetica', 7)
    canvas_obj.setFillColor(TEXT_MED)
    canvas_obj.drawString(30, 20, f"DigiLearn CRM | {title}")
    canvas_obj.drawRightString(A4[0]-30, 20, f"Page {doc.page}")
    canvas_obj.restoreState()


def generate(title, subtitle, body_text, output_filename):
    path = os.path.join(OUT_DIR, output_filename)
    doc = SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=25*mm, rightMargin=25*mm,
        topMargin=20*mm, bottomMargin=20*mm
    )
    story = []
    story.append(Paragraph(title, styles['RTitle']))
    story.append(Paragraph(subtitle, styles['RSub']))
    story.append(HRFlowable(width="100%", thickness=1, color=MED_BLUE, spaceAfter=12))
    story.extend(parse_body(body_text))
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=BORDER, spaceAfter=6))
    now = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    story.append(Paragraph(f"Generated {now} | DigiLearn CRM Audit System | digilearn-crm MCP Server", styles['Foot']))
    doc.build(
        story,
        onFirstPage=lambda c, d: hdr_footer(c, d, title),
        onLaterPages=lambda c, d: hdr_footer(c, d, title)
    )
    return path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a CRM report PDF")
    parser.add_argument("--title", required=True, help="Report title")
    parser.add_argument("--subtitle", default="", help="Report subtitle")
    parser.add_argument("--body", help="Path to body text file (markdown-like)")
    parser.add_argument("--out", required=True, help="Output filename (e.g. report.pdf)")
    args = parser.parse_args()

    if args.body:
        with open(args.body, 'r', encoding='utf-8') as f:
            body = f.read()
    else:
        body = sys.stdin.read()

    path = generate(args.title, args.subtitle, body, args.out)
    print(f"PDF saved: {path}")
