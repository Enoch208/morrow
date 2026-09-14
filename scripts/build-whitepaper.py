import argparse
import hashlib
import json
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable, KeepInFrame

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--font-dir", type=Path, required=True)
args = parser.parse_args()
pdfmetrics.registerFont(TTFont("Body", str(args.font_dir / "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("Strong", str(args.font_dir / "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFontFamily("Body", normal="Body", bold="Strong", italic="Body", boldItalic="Strong")
DATA = json.loads((ROOT / "docs/whitepaper/content.json").read_text())
OUTPUT = ROOT / "output/pdf"
OUTPUT.mkdir(parents=True, exist_ok=True)
WIDTH, HEIGHT = A4
MARGIN = 46
CONTENT = WIDTH - MARGIN * 2
INK = colors.HexColor("#202321")
MUTED = colors.HexColor("#626961")
ORANGE = colors.HexColor("#D34A26")
PALE = colors.HexColor("#F4F5F1")
LINE = colors.HexColor("#DCE0D7")
STYLES = {
    "p": ParagraphStyle("p", fontName="Body", fontSize=9.6, leading=14.6, textColor=INK, spaceAfter=10),
    "small": ParagraphStyle("small", fontName="Body", fontSize=7.8, leading=11.5, textColor=MUTED, spaceAfter=8),
    "h": ParagraphStyle("h", fontName="Strong", fontSize=12.5, leading=17, textColor=INK, spaceBefore=10, spaceAfter=7),
    "title": ParagraphStyle("title", fontName="Strong", fontSize=23, leading=28, textColor=INK, spaceAfter=15),
    "kicker": ParagraphStyle("kicker", fontName="Strong", fontSize=8, leading=12, textColor=ORANGE, spaceAfter=9),
    "cell": ParagraphStyle("cell", fontName="Body", fontSize=8.1, leading=11.5, textColor=INK),
    "head": ParagraphStyle("head", fontName="Strong", fontSize=8.2, leading=11.5, textColor=colors.white),
    "code": ParagraphStyle("code", fontName="Body", fontSize=7.6, leading=11.4, textColor=INK),
}
BASE = "https://github.com/Enoch208/morrow/blob/4db8c9c/"
REFS = [
    ("R1", "Source vault and lifecycle enforcement", BASE + "contracts/src/source/FundedPaymentVault.sol"),
    ("R2", "Destination market, native authentication and proof binding", BASE + "contracts/src/destination/MorrowMarket.sol"),
    ("R3", "Canonical terms and field order", BASE + "packages/protocol/src/terms.ts"),
    ("R4", "Campaign claims ledger and raw receipt/proof links", BASE + "docs/CLAIMS_LEDGER.md"),
    ("R5", "Independent continuity-preservation comparator", BASE + "packages/reference/src/proof-continuity.ts"),
    ("R6", "Seller preflight implementation", BASE + "packages/sdk/src/preflight.ts"),
    ("R7", "Submission verifier: checks, exit codes and finality scope", BASE + "docs/SUBMISSION_VERIFICATION.md"),
    ("R8", "Published protocol, campaign and verification limitations", BASE + "docs/KNOWN_LIMITATIONS.md"),
    ("R9", "Official Attestcoin examples dependency manifest", "https://github.com/gluwa/attestcoin-protocol-examples/blob/main/package.json"),
    ("R10", "Archived all-pass report: 13 Sep 2026, 14:17 UTC", BASE + "evidence/blobs/954be668fd213574fb3790563b6c02d684a79f309bb761029354ea8aa362cbd0.json"),
    ("R11", "Custody compiler/deployment provenance", BASE + "deployments/custody/provenance-1789252172280.json"),
    ("R12", "Archived backend checks and test counts", BASE + "evidence/local/backend-check-1789308979675.json"),
    ("R13", "Selected mutation campaign report", BASE + "evidence/local/mutations-1789292743489.json"),
    ("R14", "Native proof authentication and transaction-index derivation", BASE + "contracts/src/libraries/AttestcoinGate.sol"),
    ("R15", "Authenticated source event to canonical sale binding", BASE + "contracts/src/libraries/ProofBindingLib.sol"),
    ("R16", "Frozen-release recheck: 14 Sep 2026, 07:52 UTC - 26 PASS", "https://morrow-whitepaper.vercel.app/evidence/ca6018650e557daa9193ce783d27acd2abc7bcf8b6b6823b018a008d6c782dca.json"),
]
TXS = [
    ("A-fund", "CC3", "0x85dbf790f02a40e1b03a39a43c3345fb5e34c1674141b4680d457c24fb6b719f"),
    ("A-assign", "Sepolia", "0xf761898b50db1081955f52aaab4cf02891b4b0586a299ab60d0c206cce0e5028"),
    ("A-redeem", "Sepolia", "0x84d435b1a5e853ea19473b01ce5fbed934b5da40deb92213a23e4cdd2248744b"),
    ("A-settle", "CC3", "0x2d08bbcbb4271b0d3ecdfd8a023d04ec1657588f14b2528d7065e29ec13addbe"),
    ("A-seller", "CC3", "0xf40820d3969308e8907d1120dd5995124ecc2259630be29059004e1c4d4c889f"),
    ("A-fee", "CC3", "0x724d4808b219fe838f530f3de5b163965f6cec329f0999a225856802c0fa125c"),
]
DEPLOYMENTS = [
    ["Sepolia vault", "0xEF6EE2fa664da7D3d710b272850CFAa6Ac73D583"],
    ["Sepolia mSRC", "0x77B3e1AE0cad279b8Ad1e7b01a89efd139E1e5E9"],
    ["CC3 market", "0x7c3310280083eE63e32427D11d0A7C2CAf584474"],
    ["CC3 mSET", "0xD48Fb19fd5C2Dc98f58484B38E5d54388EceADC0"],
]
TERMS = re.findall(r'\{ name: "([^"]+)", type: "([^"]+)" \}', (ROOT / "packages/protocol/src/terms.ts").read_text())
if len(TERMS) != 18:
    raise ValueError("Canonical terms changed; review the whitepaper before rendering")

def paragraph(text, style="p"):
    value = escape(text).replace("\n", "<br/>")
    value = re.sub(r"\[(R\d+)\]", r'<link href="#\1" color="#D34A26">[\1]</link>', value)
    return Paragraph(value, STYLES[style])

def table(headers, rows, widths=None):
    count = len(headers)
    widths = widths or ([CONTENT * .22, CONTENT * .39, CONTENT * .39] if count == 3 else [CONTENT / count] * count)
    content = [[paragraph(value, "head") for value in headers]]
    content += [[paragraph(str(value), "cell") for value in row] for row in rows]
    item = Table(content, colWidths=widths, hAlign="LEFT", repeatRows=1)
    item.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [PALE, colors.white]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, -1), (-1, -1), .6, LINE),
    ]))
    return item

class Graphic(Flowable):
    def __init__(self, kind, nodes=None):
        Flowable.__init__(self)
        self.width = CONTENT
        self.height = 180 if kind == "architecture" else 58
        self.kind = kind
        self.nodes = nodes

    def box(self, x, y, width, height, label):
        canvas = self.canv
        canvas.setFillColor(PALE)
        canvas.setStrokeColor(LINE)
        canvas.roundRect(x, y, width, height, 6, fill=1, stroke=1)
        style = ParagraphStyle("diagram", parent=STYLES["cell"], alignment=TA_CENTER, fontName="Strong", fontSize=8.1)
        text = Paragraph(escape(label).replace("\n", "<br/>"), style)
        _, needed = text.wrap(width - 14, height)
        text.drawOn(canvas, x + 7, y + (height - needed) / 2)

    def arrow(self, x1, y1, x2, y2):
        canvas = self.canv
        canvas.setStrokeColor(ORANGE)
        canvas.setFillColor(ORANGE)
        canvas.setLineWidth(1.4)
        canvas.line(x1, y1, x2, y2)
        path = canvas.beginPath()
        path.moveTo(x2, y2)
        if y1 == y2:
            path.lineTo(x2 - 5, y2 + 3)
            path.lineTo(x2 - 5, y2 - 3)
        else:
            path.lineTo(x2 - 3, y2 + 5)
            path.lineTo(x2 + 3, y2 + 5)
        path.close()
        canvas.drawPath(path, fill=1, stroke=0)

    def draw(self):
        if self.kind == "architecture":
            self.box(0, 112, 155, 52, "SEPOLIA\nVault holds mSRC backing")
            self.box(CONTENT - 170, 112, 170, 52, "CREDITCOIN CC3\nMarket holds mSET purchase")
            self.box(171, 49, 145, 49, "Proof service / submitter\nTransports source evidence")
            self.box(CONTENT - 170, 0, 170, 43, "Native BlockProver\nAuthenticates the evidence")
            self.arrow(77, 110, 77, 73)
            self.arrow(77, 73, 169, 73)
            self.arrow(318, 73, CONTENT - 86, 73)
            self.canv.line(CONTENT - 86, 73, CONTENT - 86, 110)
            self.arrow(CONTENT - 35, 110, CONTENT - 35, 45)
            self.canv.setFillColor(MUTED)
            self.canv.setFont("Body", 7)
            self.canv.drawString(168, 135, "No asset bridge")
        else:
            widths = [100, 105, CONTENT - 245]
            x = 0
            for index, (label, width) in enumerate(zip(self.nodes, widths)):
                self.box(x, 7, width, 44, label.replace(" or ", "\nor "))
                if index < 2:
                    self.arrow(x + width + 2, 29, x + width + 17, 29)
                x += width + 20

def page_background(canvas, doc):
    canvas.saveState()
    if doc.page == 1:
        canvas.setFillColor(INK)
        canvas.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
        canvas.setFillColor(ORANGE)
        canvas.rect(MARGIN, HEIGHT - 107, 53, 5, fill=1, stroke=0)
        canvas.setFillColor(colors.white)
        canvas.setFont("Strong", 42)
        canvas.drawString(MARGIN, HEIGHT - 175, "MORROW")
        title = Paragraph("Sell a locked payout<br/>before it unlocks.", ParagraphStyle("cover", fontName="Strong", fontSize=34, leading=42, textColor=colors.white))
        title.wrap(CONTENT, 150)
        title.drawOn(canvas, MARGIN, HEIGHT - 320)
        subtitle = Paragraph(DATA["subtitle"], ParagraphStyle("sub", fontName="Body", fontSize=15, leading=22, textColor=colors.HexColor("#D2D8CE")))
        subtitle.wrap(CONTENT - 70, 70)
        subtitle.drawOn(canvas, MARGIN, HEIGHT - 394)
        canvas.setStrokeColor(colors.HexColor("#515A4E"))
        canvas.line(MARGIN, 293, WIDTH - MARGIN, 293)
        for offset, line in enumerate([DATA["version"], DATA["date"], "DeFi | Sepolia + Creditcoin CC3 testnet"]):
            canvas.setFont("Body", 10)
            canvas.drawString(MARGIN, 266 - offset * 22, line)
        disclaimer = Paragraph("Testnet implementation and recorded evidence.<br/>Not an audit, token offering or production-readiness claim.<br/>Assets remain on their respective chains; authenticated evidence crosses.", ParagraphStyle("coverNote", fontName="Body", fontSize=9, leading=14, textColor=colors.HexColor("#B5BFB0")))
        disclaimer.wrap(CONTENT, 75)
        disclaimer.drawOn(canvas, MARGIN, 111)
        canvas.linkURL("https://morrow-inky.vercel.app", (MARGIN, 57, MARGIN + 190, 78), relative=0)
        canvas.setFont("Body", 9)
        canvas.drawString(MARGIN, 65, "morrow-inky.vercel.app")
    else:
        canvas.setFont("Strong", 8)
        canvas.setFillColor(ORANGE)
        canvas.drawString(MARGIN, HEIGHT - 35, "MORROW")
        canvas.setFillColor(MUTED)
        canvas.setFont("Body", 7.5)
        canvas.drawRightString(WIDTH - MARGIN, HEIGHT - 35, DATA["version"].upper())
        canvas.setStrokeColor(LINE)
        canvas.line(MARGIN, 43, WIDTH - MARGIN, 43)
        canvas.drawString(MARGIN, 29, "14 SEPTEMBER 2026  |  TESTNET ONLY")
        canvas.drawRightString(WIDTH - MARGIN, 29, str(doc.page).zfill(2))
    canvas.restoreState()

class Whitepaper(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if getattr(flowable, "section_key", None):
            self.canv.bookmarkPage(flowable.section_key)
            self.canv.addOutlineEntry(flowable.section_title, flowable.section_key, level=0)

story = [Spacer(1, 1), PageBreak()]
sections = []
markdown = ["# Morrow", DATA["subtitle"], DATA["version"] + " | " + DATA["date"], "Testnet only. Not an audit or production financial product."]
for page_index, page in enumerate(DATA["pages"]):
    section_start = len(story)
    story.append(paragraph(page["number"] + " / " + page["kicker"], "kicker"))
    title = paragraph(page["title"], "title")
    story.append(title)
    markdown.append("## " + page["number"] + " " + page["title"])
    for block in page["blocks"]:
        kind = block["type"]
        if kind in ("p", "small", "h"):
            story.append(paragraph(block["text"], kind))
            markdown.append(("### " if kind == "h" else "") + block["text"])
        elif kind in ("callout", "code"):
            box = Table([[paragraph(block["text"], "p" if kind == "callout" else "code")]], colWidths=[CONTENT])
            box.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), PALE), ("BOX", (0, 0), (-1, -1), .5, LINE), ("LEFTPADDING", (0, 0), (-1, -1), 12), ("RIGHTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 11), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
            story.extend([box, Spacer(1, 11)])
            markdown.append("> " + block["text"] if kind == "callout" else "```text\n" + block["text"] + "\n```")
        elif kind in ("architecture", "flow"):
            story.extend([Graphic(kind, block.get("nodes")), Spacer(1, 12)])
            markdown.append(" -> ".join(block["nodes"]) if kind == "flow" else "Sepolia vault -> source evidence -> proof submitter -> CC3 market -> native verification. Application assets remain in their respective custody contracts.")
        elif kind in ("table", "terms", "deployments"):
            headers, rows, widths = block.get("headers"), block.get("rows"), None
            if kind == "terms":
                headers = ["Position", "Canonical field", "ABI type"]
                rows = [[str(index + 1), name, type_name] for index, (name, type_name) in enumerate(TERMS)]
                widths = [60, CONTENT - 150, 90]
            if kind == "deployments":
                headers, rows, widths = ["Deployment", "Address"], DEPLOYMENTS, [110, CONTENT - 110]
            story.extend([table(headers, rows, widths), Spacer(1, 12)])
            markdown.append("\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"] + ["| " + " | ".join(row) + " |" for row in rows]))
        elif kind == "references":
            for key, label, url in REFS:
                story.append(Paragraph(f'<a name="{key}"/><b>[{key}]</b> <link href="{escape(url)}" color="#D34A26">{escape(label)}</link>', STYLES["small"]))
                markdown.append(f"[{key}] [{label}]({url})")
        elif kind == "transactions":
            for label, chain, tx_hash in TXS:
                explorer = "https://sepolia.etherscan.io/tx/" if chain == "Sepolia" else "https://creditcoin-testnet.blockscout.com/tx/"
                story.append(Paragraph(f'<b>{label} / {chain}</b><br/><link href="{explorer + tx_hash}" color="#D34A26">{tx_hash}</link>', STYLES["small"]))
                markdown.append(f"{label} / {chain}: [{tx_hash}]({explorer + tx_hash})")
        else:
            raise ValueError(kind)
    section = KeepInFrame(CONTENT, HEIGHT - 140, story[section_start:], mode="shrink", hAlign="LEFT", vAlign="TOP")
    section.section_key = "section" + page["number"]
    section.section_title = page["number"] + " " + page["title"]
    sections.append(section)
    story[section_start:] = [section]
    if page_index < len(DATA["pages"]) - 1:
        story.append(PageBreak())

pdf_path = OUTPUT / "morrow-whitepaper-v1.pdf"
doc = Whitepaper(str(pdf_path), pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=69, bottomMargin=59, title="Morrow - " + DATA["version"], author="Morrow", subject=DATA["subtitle"], pageCompression=1)
doc.build(story, onFirstPage=page_background, onLaterPages=page_background)
(ROOT / "docs/whitepaper/WHITEPAPER.md").write_text("\n\n".join(markdown) + "\n")
print(json.dumps({"pdf": str(pdf_path), "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(), "bytes": pdf_path.stat().st_size, "sectionScaleDivisors": [round(getattr(section, "_scale", 1), 3) for section in sections]}))
