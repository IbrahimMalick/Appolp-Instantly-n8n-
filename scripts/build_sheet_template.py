#!/usr/bin/env python3
"""Build sheet-template/LXG-Outreach-Tracker.xlsx from src/schema.json.

Upload the .xlsx to Google Drive and choose "Open with > Google Sheets" (File > Save as Google Sheets)
to get the tracker with all tabs, headers, status dropdown and Summary formulas. See docs/google-sheet-schema.md.
Requires: pip install openpyxl
"""
import json
import pathlib

from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

ROOT = pathlib.Path(__file__).resolve().parent.parent
S = json.loads((ROOT / "src" / "schema.json").read_text())
TABS, STATUSES = S["tabs"], S["statuses"]
N = 20000  # rows covered by Summary formulas (~ 1 year at 500 leads/week)

wb = Workbook()
wb.remove(wb.active)
HEAD = PatternFill("solid", fgColor="1F3A5F")


def col(tab, name):
    return get_column_letter(TABS[tab].index(name) + 1)


def rng(tab, name):
    c = col(tab, name)
    return f"{tab}!${c}$2:${c}${N}"


for tab, cols in TABS.items():
    ws = wb.create_sheet(tab)
    ws.append(cols)
    for i, c in enumerate(cols, 1):
        cell = ws.cell(1, i)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = HEAD
        cell.alignment = Alignment(wrap_text=True, vertical="center")
        ws.column_dimensions[get_column_letter(i)].width = max(14, min(34, len(c) + 6))
    ws.freeze_panes = "A2"
    if tab != "Summary":
        ws.auto_filter.ref = f"A1:{get_column_letter(len(cols))}1"

# Leads: status dropdown + highlighting
ws = wb["Leads"]
sc = col("Leads", "Current Status")
dv = DataValidation(type="list", formula1='"' + ",".join(STATUSES) + '"', allow_blank=True, showErrorMessage=False)
ws.add_data_validation(dv)
dv.add(f"{sc}2:{sc}{N}")
for val, color in (("ERROR", "F8CBAD"), ("REPLIED", "C6EFCE"), ("UNSUBSCRIBED", "FFEB9C"), ("STOPPED", "D9D9D9")):
    ws.conditional_formatting.add(f"{sc}2:{sc}{N}", CellIsRule(operator="equal", formula=[f'"{val}"'], fill=PatternFill("solid", bgColor=color)))

# Summary
ws = wb["Summary"]
ws.column_dimensions["A"].width = 44
ws.column_dimensions["B"].width = 58
ws.column_dimensions["C"].width = 56
st = rng("Leads", "Current Status")
step = rng("Leads", "Last Step Sent")
rows = [
    ("— Lead funnel (formulas, from Leads tab) —", None, None),
    ("Total leads", f'=COUNTIF({rng("Leads","Lead ID")},"?*")', "Rows in Leads (everything that passed qualification)"),
    ("Qualified leads (awaiting enrolment)", f'=COUNTIF({st},"QUALIFIED")', "Status QUALIFIED"),
    ("Enrolled leads (ever)", f'=COUNTIF({rng("Leads","Date Enrolled")},"?*")', "Rows with an enrolment date"),
    ("Emails sent (from webhook events)", f'=SUMPRODUCT(--(0&{step}))', "Sum of Last Step Sent; Instantly's own total is below"),
    ("Follow-ups sent", f'=SUMPRODUCT((--(0&{step})>1)*(--(0&{step})-1))', "Emails beyond step 1"),
    ("Replies", f'=COUNTIF({rng("Leads","Reply Date")},"?*")', "Rows with a reply date"),
    ("Reply rate", f'=IFERROR(B8/COUNTIF({rng("Leads","Last Email Sent")},"?*"),0)', "Replies / leads that received at least one email"),
    ("Unsubscribes", f'=COUNTIF({st},"UNSUBSCRIBED")', ""),
    ("Errors (leads currently in ERROR)", f'=COUNTIF({st},"ERROR")', "Filter Leads by Current Status = ERROR, see Error Status column"),
    ("— Intake & suppression (formulas) —", None, None),
    ("Intake rows waiting for qualification", f'=COUNTIF({rng("Intake","Intake Status")},"PENDING")', "Processed by LXG - 02 every 2 hours"),
    ("Intake rejected / duplicate / suppressed", f'=COUNTIF({rng("Intake","Intake Status")},"REJECTED")+COUNTIF({rng("Intake","Intake Status")},"DUPLICATE")+COUNTIF({rng("Intake","Intake Status")},"SUPPRESSED")', "See Reason column on Intake"),
    ("Suppression list size", f'=COUNTA({rng("Suppression","Email")})+COUNTA({rng("Suppression","Domain")})', "Never re-enrolled"),
    ("— Written by n8n (LXG - 05, weekly) —", None, None),
    ("Current campaign status", "", "From Instantly"),
    ("Emails sent (Instantly, all time)", "", "From Instantly analytics"),
    ("Last successful workflow run", "", "From Heartbeat tab"),
    ("Workflow health", "", "From Heartbeat tab"),
    ("Last report generated", "", ""),
]
ws.append([])  # keep header on row 1; data from row 2
ws.delete_rows(2)
for i, (m, v, n) in enumerate(rows, start=2):
    ws.cell(i, 1, m)
    if v is None:
        ws.cell(i, 1).font = Font(bold=True)
        continue
    ws.cell(i, 2, v)
    ws.cell(i, 3, n)
ws["B9"].number_format = "0.0%"
assert ws["A9"].value == "Reply rate" and ws["A8"].value == "Replies"  # B8/B9 references above rely on this layout

out = ROOT / "sheet-template" / "LXG-Outreach-Tracker.xlsx"
out.parent.mkdir(exist_ok=True)
wb.save(out)
print("wrote", out.relative_to(ROOT))
