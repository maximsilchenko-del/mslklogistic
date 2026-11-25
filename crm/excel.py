"""Minimal XLSX writer built on the standard library.

Produces a single-sheet workbook with a bold header row, frozen top row and
optional column widths. Numbers are written as numeric cells, everything else
as inline strings, so Cyrillic text needs no shared-string table.
"""

import io
import re
import zipfile
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>"""

ROOT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

WORKBOOK_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"""

STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF2F7"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"""


def column_letter(index):
    letters = ""
    index += 1
    while index:
        index, rem = divmod(index - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def safe_sheet_name(name):
    cleaned = re.sub(r"[\[\]:*?/\\]", " ", str(name or "Лист")).strip() or "Лист"
    return cleaned[:31]


def cell_xml(ref, value, header=False):
    style = ' s="1"' if header else ""
    if value is None or value == "":
        return '<c r="%s"%s/>' % (ref, style)
    if isinstance(value, bool):
        value = int(value)
    if isinstance(value, (int, float)):
        return '<c r="%s"%s><v>%s</v></c>' % (ref, style, value)
    text = escape(str(value))
    return '<c r="%s"%s t="inlineStr"><is><t xml:space="preserve">%s</t></is></c>' % (ref, style, text)


def build_xlsx(sheet_name, headers, rows, widths=None):
    """Return XLSX bytes for one worksheet."""
    matrix = [list(headers)] + [list(row) for row in rows]
    parts = []
    for row_index, row in enumerate(matrix):
        cells = []
        for col_index, value in enumerate(row):
            cells.append(cell_xml("%s%d" % (column_letter(col_index), row_index + 1), value, header=row_index == 0))
        parts.append('<row r="%d">%s</row>' % (row_index + 1, "".join(cells)))
    cols_xml = ""
    if widths:
        items = []
        for index, width in enumerate(widths):
            items.append('<col min="%d" max="%d" width="%s" customWidth="1"/>' % (index + 1, index + 1, width))
        cols_xml = "<cols>%s</cols>" % "".join(items)
    dimension = "A1:%s%d" % (column_letter(max(len(headers) - 1, 0)), max(len(matrix), 1))
    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<dimension ref="%s"/>'
        '<sheetViews><sheetView workbookViewId="0">'
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        '</sheetView></sheetViews>'
        '<sheetFormatPr defaultRowHeight="15"/>%s'
        '<sheetData>%s</sheetData>'
        '</worksheet>'
    ) % (dimension, cols_xml, "".join(parts))

    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="%s" sheetId="1" r:id="rId1"/></sheets>'
        '</workbook>'
    ) % escape(safe_sheet_name(sheet_name))

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", CONTENT_TYPES)
        archive.writestr("_rels/.rels", ROOT_RELS)
        archive.writestr("xl/workbook.xml", workbook)
        archive.writestr("xl/_rels/workbook.xml.rels", WORKBOOK_RELS)
        archive.writestr("xl/styles.xml", STYLES)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)
    return buffer.getvalue()


NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def column_index(ref):
    letters = re.match(r"([A-Z]+)", str(ref or ""))
    if not letters:
        return 0
    index = 0
    for char in letters.group(1):
        index = index * 26 + (ord(char) - 64)
    return index - 1


def cell_value(cell, shared):
    kind = cell.get("t", "n")
    if kind == "inlineStr":
        node = cell.find(NS + "is")
        if node is None:
            return ""
        return "".join(part.text or "" for part in node.iter(NS + "t"))
    value = cell.find(NS + "v")
    text = value.text if value is not None and value.text is not None else ""
    if kind == "s":
        try:
            return shared[int(text)]
        except (ValueError, IndexError):
            return ""
    if kind in ("str", "e"):
        return text
    if kind == "b":
        return "1" if text == "1" else "0"
    text = text.strip()
    if text.endswith(".0") and text[:-2].isdigit():
        text = text[:-2]
    return text


def read_xlsx(data, max_rows=2000):
    """Read the first worksheet of an XLSX file into a list of string rows."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise ValueError("Файл не похож на Excel .xlsx")
    names = set(archive.namelist())
    shared = []
    if "xl/sharedStrings.xml" in names:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
        for item in root.findall(NS + "si"):
            shared.append("".join(part.text or "" for part in item.iter(NS + "t")))
    sheet_name = next((name for name in ("xl/worksheets/sheet1.xml", "xl/worksheets/sheet.xml") if name in names), None)
    if sheet_name is None:
        candidates = sorted(name for name in names if name.startswith("xl/worksheets/") and name.endswith(".xml"))
        sheet_name = candidates[0] if candidates else None
    if sheet_name is None:
        raise ValueError("В файле нет листов")
    root = ET.fromstring(archive.read(sheet_name))
    rows = []
    for row in root.iter(NS + "row"):
        cells = {}
        fallback = 0
        for cell in row.findall(NS + "c"):
            index = column_index(cell.get("r")) if cell.get("r") else fallback
            fallback = index + 1
            cells[index] = cell_value(cell, shared)
        if not cells:
            continue
        width = max(cells) + 1
        rows.append([str(cells.get(index, "") or "").strip() for index in range(width)])
        if len(rows) >= max_rows:
            break
    return rows
