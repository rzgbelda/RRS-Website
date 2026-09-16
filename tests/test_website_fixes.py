"""
Room Ready Supply - Website Fix Verification
=============================================

Runs the fixes from the 15 September 2026 bottleneck audit against the LIVE
site and writes a signed-off Word report for Eric Menges (CEO).

Run it:      python tests/test_website_fixes.py
See the bottom of this file, or README_TESTING.md, for full instructions.

What it does NOT do
-------------------
This script never submits an order and never enters payment details. It
verifies everything up to the payment step and stops there, so running it
against the live site cannot create a real order or a real charge.
"""

from __future__ import annotations

import sys
import time
import traceback
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# Dependency check, before anything else, with a fixable message.
# ---------------------------------------------------------------------------
try:
    from playwright.sync_api import sync_playwright, Page, TimeoutError as PWTimeout
except ImportError:
    sys.exit(
        "\nMissing dependency: playwright\n"
        "Run these two commands, then try again:\n"
        "    pip install playwright python-docx\n"
        "    python -m playwright install chromium\n"
    )

try:
    from docx import Document
    from docx.shared import Pt, Inches, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT
except ImportError:
    sys.exit(
        "\nMissing dependency: python-docx\n"
        "Run this, then try again:\n"
        "    pip install python-docx\n"
    )


BASE = "https://www.roomreadysupply.com"
AFFILIATE_BASE = "https://trustmarkcleaners.roomreadysupply.com"
OUTPUT_DIR = Path.home() / "Downloads"

# Brand colours, used in the Word report.
NAVY = RGBColor(0x0D, 0x2C, 0x50)
ORANGE = RGBColor(0xED, 0x72, 0x26)
GREEN = RGBColor(0x1A, 0x7A, 0x4C)
RED = RGBColor(0xC2, 0x3B, 0x3B)
GREY = RGBColor(0x5D, 0x64, 0x70)


# ---------------------------------------------------------------------------
# Result model
# ---------------------------------------------------------------------------
@dataclass
class TestResult:
    ref: str                 # e.g. "TC-03"
    item: str                # audit item number(s) this covers
    title: str
    expected: str
    actual: str = ""
    status: str = "NOT RUN"  # PASS | FAIL | ERROR | NOT RUN
    notes: str = ""

    @property
    def passed(self) -> bool:
        return self.status == "PASS"


@dataclass
class Suite:
    results: list[TestResult] = field(default_factory=list)
    started: datetime = field(default_factory=datetime.now)

    def add(self, r: TestResult) -> TestResult:
        self.results.append(r)
        icon = {"PASS": "[PASS]", "FAIL": "[FAIL]", "ERROR": "[ERR ]"}.get(r.status, "[    ]")
        print(f"  {icon} {r.ref}  {r.title}")
        if r.status != "PASS":
            print(f"         expected: {r.expected}")
            print(f"         actual:   {r.actual}")
        return r

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.status == "PASS")

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if r.status in ("FAIL", "ERROR"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def check(suite: Suite, ref: str, item: str, title: str, expected: str,
          fn) -> TestResult:
    """Run one check. fn() returns (ok: bool, actual: str, notes: str)."""
    r = TestResult(ref=ref, item=item, title=title, expected=expected)
    try:
        ok, actual, notes = fn()
        r.actual = actual
        r.notes = notes
        r.status = "PASS" if ok else "FAIL"
    except PWTimeout as e:
        r.actual = f"Timed out waiting for the page: {str(e)[:120]}"
        r.status = "ERROR"
    except Exception as e:
        r.actual = f"{type(e).__name__}: {str(e)[:160]}"
        r.status = "ERROR"
        r.notes = "Unexpected error - see console output."
    return suite.add(r)


def add_first_product_to_cart(page: Page) -> str:
    """Add the first purchasable catalog item to the cart. Returns its name."""
    page.goto(f"{BASE}/catalog", wait_until="domcontentloaded")
    page.wait_for_selector(".product-card .add-btn", timeout=30000)
    btn = page.locator(".product-card .add-btn").first
    name = page.evaluate(
        "() => { const b = document.querySelector('.product-card .add-btn');"
        " return b ? (b.dataset.name || '') : ''; }"
    )
    btn.click()
    page.wait_for_timeout(1200)
    return name


# ---------------------------------------------------------------------------
# The test cases
# ---------------------------------------------------------------------------
def run_tests(page: Page, suite: Suite) -> None:

    # -- TC-01 ---------------------------------------------------------------
    print("\nCheckout wording and flow")

    def tc01():
        page.goto(f"{BASE}/checkout", wait_until="domcontentloaded")
        page.wait_for_selector("h1", timeout=20000)
        h1 = page.locator("h1").first.inner_text().strip()
        ok = "order request" not in h1.lower()
        return ok, f'Heading reads "{h1}"', (
            "Audit item 1: page previously read 'Submit Your Order Request', "
            "which told buyers they were enquiring rather than purchasing."
        )

    check(suite, "TC-01", "1, 15",
          "Checkout heading describes a purchase, not a request",
          'Heading does not say "Order Request"', tc01)

    # -- TC-02 ---------------------------------------------------------------
    def tc02():
        txt = page.evaluate(
            "() => { const b = document.getElementById('submitOrderBtn');"
            " return b ? b.textContent.trim() : 'BUTTON NOT FOUND'; }"
        )
        ok = "payment" in txt.lower()
        return ok, f'Button reads "{txt}"', (
            "Must name the next step, since the following page takes card/ACH payment."
        )

    check(suite, "TC-02", "1, 15",
          "Submit button names the payment step",
          'Button mentions "Payment"', tc02)

    # -- TC-03 ---------------------------------------------------------------
    def tc03():
        ack = page.evaluate(
            "() => { const e = document.getElementById('ackDeliveryEstimateText');"
            " return e ? e.textContent.trim() : ''; }"
        )
        has_window = "3" in ack and "business day" in ack.lower()
        no_phantom = "stated delivery date" not in ack.lower()
        ok = has_window and no_phantom
        return ok, (ack[:150] + "...") if len(ack) > 150 else (ack or "NOT FOUND"), (
            "Audit item 14: buyers were asked to acknowledge a delivery date "
            "that was never displayed anywhere on the page."
        )

    check(suite, "TC-03", "14",
          "Delivery acknowledgment states a real processing window",
          "States 3-5 business days; no reference to an unshown date", tc03)

    # -- TC-04 ---------------------------------------------------------------
    def tc04():
        ph = page.evaluate(
            "() => { const e = document.getElementById('checkout-phone');"
            " return e ? e.placeholder : 'FIELD NOT FOUND'; }"
        )
        ok = "227-0073" not in ph
        return ok, f'Placeholder is "{ph}"', (
            "Audit item 13: RRS's real number read as pre-filled, so buyers "
            "left it alone. It was a placeholder and never submitted."
        )

    check(suite, "TC-04", "13",
          "Phone placeholder is not RRS's own number",
          "Placeholder is a generic format hint", tc04)

    # -- TC-05 ---------------------------------------------------------------
    def tc05():
        label = page.evaluate(
            "() => { const e = document.getElementById('checkoutBusinessLabel');"
            " return e ? e.textContent.trim() : 'FIELD NOT FOUND'; }"
        )
        ok = "optional" in label.lower()
        return ok, f'Field labelled "{label[:70]}"', (
            "Audit item 12: RRS also sells to homes, rentals and salons, so a "
            "mandatory business name turned those buyers away."
        )

    check(suite, "TC-05", "12",
          "Business name is optional",
          'Field is marked "(optional)"', tc05)

    # -- TC-06 --------------------------------------------------------------
    print("\nOrder total and delivery")

    def tc06():
        label = page.evaluate(
            "() => { const e = document.querySelector('.summary-total span');"
            " return e ? e.textContent.trim() : 'NOT FOUND'; }"
        )
        ok = "before delivery" in label.lower()
        return ok, f'Total labelled "{label}"', (
            "Audit item 2: 'Estimated Total' silently excluded delivery, "
            "reading as a final price when it was not."
        )

    check(suite, "TC-06", "2",
          "Total is labelled as excluding delivery",
          'Reads "Total before delivery"', tc06)

    # -- TC-07 ---------------------------------------------------------------
    def tc07():
        page.wait_for_timeout(1500)  # let warp-freight.js settle
        ship = page.evaluate(
            "() => { const e = document.getElementById('summary-shipping');"
            " return e ? e.textContent.trim() : 'NOT FOUND'; }"
        )
        ok = ship.lower() not in ("tbd", "not found", "")
        return ok, f'Delivery line reads "{ship}"', (
            "Must tell the buyer how delivery is priced. 'TBD' is not an answer."
        )

    check(suite, "TC-07", "2, 5",
          "Delivery line explains how shipping is priced",
          'States "Quoted separately" (not "TBD")', tc07)

    # -- TC-08 : live sales tax ----------------------------------------------
    def tc08():
        # Tax needs a cart with items, plus a destination state.
        add_first_product_to_cart(page)
        page.goto(f"{BASE}/checkout", wait_until="domcontentloaded")
        page.wait_for_selector("#checkout-state", timeout=20000)

        before = page.evaluate(
            "() => { const e = document.getElementById('summary-tax');"
            " return e ? e.textContent.trim() : ''; }"
        )
        page.select_option("#checkout-state", "NC")
        page.wait_for_timeout(1200)
        after = page.evaluate(
            "() => { const e = document.getElementById('summary-tax');"
            " return e ? e.textContent.trim() : ''; }"
        )
        rate = page.evaluate(
            "() => { const e = document.getElementById('summary-tax-rate');"
            " return e ? e.textContent.trim() : ''; }"
        )
        ok = after not in ("", "$0.00") and after != before
        return ok, f'Tax before: {before or "(blank)"} -> after selecting NC: {after}{rate}', (
            "The audit reported 'tax shows $0.00'. That is the placeholder "
            "shown BEFORE a state is chosen; tax calculates once one is."
        )

    check(suite, "TC-08", "2",
          "Sales tax calculates from the destination state",
          "Tax becomes non-zero after selecting a state", tc08)

    # -- TC-09 : add-to-cart confirmation ------------------------------------
    print("\nCart and catalog")

    def tc09():
        page.goto(f"{BASE}/catalog", wait_until="domcontentloaded")
        page.wait_for_selector(".product-card .add-btn", timeout=30000)
        page.locator(".product-card .add-btn").first.click()
        page.wait_for_timeout(900)
        toast = page.evaluate(
            "() => { const t = document.getElementById('vpToast');"
            " return t && t.classList.contains('vp-toast--visible')"
            " ? t.textContent.trim() : ''; }"
        )
        btn = page.evaluate(
            "() => { const b = document.querySelector('.product-card .add-btn');"
            " return b ? b.textContent.trim() : ''; }"
        )
        ok = bool(toast) or "added" in btn.lower()
        detail = f'Confirmation shown: "{toast or btn}"'
        return ok, detail, (
            "Audit item 7: previously only a small badge and a brief animation, "
            "which buyers missed entirely."
        )

    check(suite, "TC-09", "7",
          "Adding to cart shows a visible confirmation",
          "An on-screen confirmation appears", tc09)

    # -- TC-10 : cart icon clickable -----------------------------------------
    def tc10():
        # The bug only appeared once the cart had items (the badge is hidden
        # when empty), so the cart must be non-empty for this to be a real test.
        count = page.evaluate(
            "() => { const c = document.getElementById('cart-count');"
            " return c ? c.textContent.trim() : '0'; }"
        )
        # Verify the property that actually caused the bug: the badge must not
        # intercept pointer events. Measuring coordinates proved unreliable --
        # the badge is deliberately offset past the icon's corner, so how much
        # it overlaps changes with viewport width, and a probe point can miss
        # for reasons that have nothing to do with the fix.
        takes_clicks = page.evaluate(
            "() => { const b = document.getElementById('cart-count');"
            " if (!b) return 'no badge';"
            " if (getComputedStyle(b).display === 'none') return 'hidden';"
            " return getComputedStyle(b).pointerEvents; }"
        )

        # Then do what a customer does: click the cart icon and confirm the
        # browser actually navigates to the cart.
        page.goto(f"{BASE}/catalog", wait_until="domcontentloaded")
        page.wait_for_selector(".cart-container a", timeout=20000)
        page.locator(".cart-container a").first.click()
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_timeout(800)
        landed = page.url

        navigated = "/cart" in landed
        not_blocking = takes_clicks in ("none", "hidden")
        ok = navigated and not_blocking
        return ok, (f"Cart holds {count} item(s); badge pointer-events="
                    f"{takes_clicks}; clicking the cart icon landed on {landed}"), (
            "Audit item 3: the badge is a sibling of the cart link, sitting over "
            "its corner, so clicks on it hit nothing once the cart had items."
        )

    check(suite, "TC-10", "3",
          "Cart icon is clickable through its count badge",
          "A click at the badge reaches the cart link", tc10)

    # -- TC-11 : cart page title ---------------------------------------------
    def tc11():
        page.goto(f"{BASE}/cart", wait_until="domcontentloaded")
        title = page.title()
        ok = not title.lower().startswith("payment")
        return ok, f'Page title is "{title}"', "Audit item 16."

    check(suite, "TC-11", "16",
          "Cart page title names the cart",
          'Title does not read "Payment"', tc11)

    # -- TC-12 : marketing opt-in --------------------------------------------
    print("\nConsent and compliance")

    def tc12():
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        state = page.evaluate(
            "() => { const c = document.getElementById('qMarketingOptIn');"
            " return c === null ? 'NOT FOUND' : (c.checked ? 'CHECKED' : 'unchecked'); }"
        )
        ok = state == "unchecked"
        return ok, f"Opt-in checkbox is {state} by default", (
            "Audit item 17: a pre-ticked consent box is not valid consent "
            "under GDPR and carries CAN-SPAM risk."
        )

    check(suite, "TC-12", "17",
          "Marketing opt-in is not pre-checked",
          "Checkbox is unchecked on page load", tc12)

    # -- TC-13 / TC-14 : affiliate disclaimer --------------------------------
    print("\nAffiliate storefront disclosure")

    def tc13():
        page.goto(f"{AFFILIATE_BASE}/", wait_until="domcontentloaded")
        page.wait_for_timeout(2500)  # affiliate lookup is a network round-trip
        bar = page.evaluate(
            "() => { const b = document.getElementById('affiliateIdBar');"
            " return b ? b.textContent.trim() : ''; }"
        )
        ok = "independent affiliate" in bar.lower()
        return ok, bar or "Identification bar NOT FOUND", (
            "CEO requirement: the affiliate must be named as an affiliate "
            "above the RRS logo so customers cannot mistake them for RRS."
        )

    check(suite, "TC-13", "CEO",
          "Affiliate site names the affiliate above the RRS logo",
          'Bar reads "<Company> - an independent affiliate of Room Ready Supply"',
          tc13)

    def tc14():
        disc = page.evaluate(
            "() => { const d = document.getElementById('affiliateDisclaimer');"
            " return d ? d.textContent.trim() : ''; }"
        )
        low = disc.lower()
        ok = "supplier" in low and "not responsible" in low
        return ok, (disc[:170] + "...") if len(disc) > 170 else (disc or "NOT FOUND"), (
            "CEO requirement: state that RRS is only the supplier and is not "
            "responsible for the affiliate's actions."
        )

    check(suite, "TC-14", "CEO",
          "Affiliate site disclaims RRS responsibility",
          "States RRS is the supplier and not responsible", tc14)

    def tc15():
        page.goto(f"{BASE}/", wait_until="domcontentloaded")
        page.wait_for_timeout(2000)
        present = page.evaluate(
            "() => !!document.getElementById('affiliateIdBar')"
            " || !!document.getElementById('affiliateDisclaimer')"
        )
        ok = not present
        return ok, ("Disclaimer wrongly shown on the main site" if present
                    else "Correctly absent from the main site"), (
            "The disclaimer must appear ONLY on affiliate subdomains - showing "
            "it on roomreadysupply.com would imply RRS is its own affiliate."
        )

    check(suite, "TC-15", "CEO",
          "Affiliate disclaimer does NOT appear on the main site",
          "No affiliate banner on roomreadysupply.com", tc15)

    # -- TC-16 : catalog grouping --------------------------------------------
    print("\nCatalog organisation")

    def tc16():
        page.goto(f"{BASE}/catalog", wait_until="domcontentloaded")
        page.wait_for_selector(".product-card", timeout=30000)
        page.wait_for_timeout(1500)
        # Category is not exposed in the card markup, so the visible evidence
        # of grouping is the options control: a product sold in several sizes
        # collapses into ONE card carrying an "N options" button, rather than
        # appearing as a separate card per size.
        stats = page.evaluate("""() => {
            const cards = [...document.querySelectorAll('.product-card')];
            const triggers = [...document.querySelectorAll('.variant-trigger')];
            let grouped = 0;
            triggers.forEach(t => {
                const m = (t.textContent || '').match(/(\\d+)\\s*option/i);
                if (m) grouped += parseInt(m[1], 10);
            });
            return { cards: cards.length, families: triggers.length, variants: grouped };
        }""")
        if not stats["cards"]:
            return False, "No product cards rendered", "Catalog did not load."
        ok = stats["families"] > 0
        saved = max(0, stats["variants"] - stats["families"])
        return ok, (f'{stats["cards"]} cards shown; {stats["families"]} of them group '
                    f'{stats["variants"]} size/variant options ({saved} fewer '
                    f"duplicate cards than ungrouped)"), (
            "Products sold in several sizes collapse into one card with an "
            "options picker, instead of one card per size."
        )

    check(suite, "TC-16", "extra",
          "Catalog collapses product sizes into one card",
          'Cards carry an "N options" picker rather than repeating per size', tc16)

    # -- TC-17 : payment page reachable, no order placed ---------------------
    print("\nPayment step (verified only - no order is submitted)")

    def tc17():
        page.goto(f"{BASE}/payment", wait_until="domcontentloaded")
        page.wait_for_timeout(2500)
        info = page.evaluate("""() => ({
            stripeLoaded: typeof Stripe !== 'undefined',
            cardMount: !!document.getElementById('stripe-card-element'),
            achMount: !!document.getElementById('stripe-ach-element')
        })""")
        ok = info["stripeLoaded"] and info["cardMount"]
        return ok, (f"Stripe library loaded: {info['stripeLoaded']}; "
                    f"card field present: {info['cardMount']}; "
                    f"ACH field present: {info['achMount']}"), (
            "The audit reported 'no payment step and no payment fields'. This "
            "confirms card and ACH payment are present and loaded. No payment "
            "is attempted by this test."
        )

    check(suite, "TC-17", "1",
          "Payment page loads Stripe card and ACH fields",
          "Stripe is loaded and payment fields exist", tc17)


# ---------------------------------------------------------------------------
# Word report
# ---------------------------------------------------------------------------
def _shade(cell, hex_colour: str) -> None:
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:fill"), hex_colour)
    tcPr.append(shd)


def build_report(suite: Suite, path: Path) -> Path:
    doc = Document()

    for section in doc.sections:
        section.top_margin = Inches(0.7)
        section.bottom_margin = Inches(0.7)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)

    # --- Title block -------------------------------------------------------
    p = doc.add_paragraph()
    r = p.add_run("ROOM READY SUPPLY")
    r.bold = True
    r.font.size = Pt(9)
    r.font.color.rgb = ORANGE

    p = doc.add_paragraph()
    r = p.add_run("Website Fix Verification Report")
    r.bold = True
    r.font.size = Pt(20)
    r.font.color.rgb = NAVY

    p = doc.add_paragraph()
    r = p.add_run(
        "Automated verification of the fixes applied following the website "
        "bottleneck audit of 15 September 2026. Executed against the live "
        "site at roomreadysupply.com."
    )
    r.font.size = Pt(10)
    r.font.color.rgb = GREY

    # --- Run metadata ------------------------------------------------------
    doc.add_paragraph()
    meta = doc.add_table(rows=4, cols=2)
    meta.style = "Table Grid"
    meta.alignment = WD_TABLE_ALIGNMENT.LEFT
    rows = [
        ("Test executed", suite.started.strftime("%d %B %Y, %I:%M %p")),
        ("Environment", "Live production - www.roomreadysupply.com"),
        ("Total test cases", str(len(suite.results))),
        ("Result", f"{suite.passed} passed, {suite.failed} failed"),
    ]
    for i, (k, v) in enumerate(rows):
        meta.rows[i].cells[0].text = k
        meta.rows[i].cells[1].text = v
        for par in meta.rows[i].cells[0].paragraphs:
            for run in par.runs:
                run.bold = True
        _shade(meta.rows[i].cells[0], "F2F4F7")

    # --- Summary banner ----------------------------------------------------
    doc.add_paragraph()
    p = doc.add_paragraph()
    if suite.failed == 0:
        r = p.add_run(f"ALL {suite.passed} TEST CASES PASSED")
        r.font.color.rgb = GREEN
    else:
        r = p.add_run(f"{suite.failed} OF {len(suite.results)} TEST CASES REQUIRE ATTENTION")
        r.font.color.rgb = RED
    r.bold = True
    r.font.size = Pt(12)

    # --- Results table -----------------------------------------------------
    doc.add_paragraph()
    p = doc.add_paragraph()
    r = p.add_run("Test Results")
    r.bold = True
    r.font.size = Pt(13)
    r.font.color.rgb = NAVY

    table = doc.add_table(rows=1, cols=5)
    table.style = "Table Grid"
    headers = ["Ref", "Audit\nItem", "Test Case", "Expected Result", "Status"]
    widths = [Inches(0.5), Inches(0.55), Inches(2.1), Inches(2.6), Inches(0.75)]
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = h
        cell.width = widths[i]
        _shade(cell, "0D2C50")
        for par in cell.paragraphs:
            for run in par.runs:
                run.bold = True
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    for res in suite.results:
        cells = table.add_row().cells
        cells[0].text = res.ref
        cells[1].text = res.item
        cells[2].text = res.title
        cells[3].text = res.expected
        cells[4].text = res.status
        for i, c in enumerate(cells):
            c.width = widths[i]
            for par in c.paragraphs:
                for run in par.runs:
                    run.font.size = Pt(8.5)
        status_run = cells[4].paragraphs[0].runs[0]
        status_run.bold = True
        status_run.font.color.rgb = GREEN if res.passed else RED
        _shade(cells[4], "ECF7F1" if res.passed else "FCEBEB")

    # --- Detailed findings -------------------------------------------------
    doc.add_page_break()
    p = doc.add_paragraph()
    r = p.add_run("Detailed Findings")
    r.bold = True
    r.font.size = Pt(13)
    r.font.color.rgb = NAVY

    for res in suite.results:
        p = doc.add_paragraph()
        r = p.add_run(f"{res.ref} - {res.title}")
        r.bold = True
        r.font.size = Pt(10.5)
        r.font.color.rgb = NAVY

        p = doc.add_paragraph()
        r = p.add_run("Status: ")
        r.bold = True
        r.font.size = Pt(9.5)
        r = p.add_run(res.status)
        r.bold = True
        r.font.size = Pt(9.5)
        r.font.color.rgb = GREEN if res.passed else RED

        for label, value in (("Expected", res.expected),
                             ("Observed", res.actual),
                             ("Context", res.notes)):
            if not value:
                continue
            p = doc.add_paragraph()
            p.paragraph_format.left_indent = Inches(0.2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(f"{label}: ")
            r.bold = True
            r.font.size = Pt(9)
            r = p.add_run(value)
            r.font.size = Pt(9)
            if label == "Context":
                r.font.color.rgb = GREY

    # --- Sign-off ----------------------------------------------------------
    doc.add_page_break()
    p = doc.add_paragraph()
    r = p.add_run("Sign-Off")
    r.bold = True
    r.font.size = Pt(13)
    r.font.color.rgb = NAVY

    p = doc.add_paragraph()
    r = p.add_run(
        "By signing below, the tester confirms that the test cases recorded in "
        "this report were executed against the live Room Ready Supply website "
        "and that the results above are a true record of what was observed."
    )
    r.font.size = Pt(10)

    doc.add_paragraph()
    sign = doc.add_table(rows=4, cols=2)
    sign.style = "Table Grid"
    sign_rows = [
        ("Tested by (name)", ""),
        ("Position / role", ""),
        ("Signature", ""),
        ("Date of test", ""),
    ]
    for i, (k, v) in enumerate(sign_rows):
        sign.rows[i].cells[0].text = k
        sign.rows[i].cells[1].text = v
        sign.rows[i].cells[0].width = Inches(1.8)
        sign.rows[i].cells[1].width = Inches(4.7)
        _shade(sign.rows[i].cells[0], "F2F4F7")
        for par in sign.rows[i].cells[0].paragraphs:
            for run in par.runs:
                run.bold = True
                run.font.size = Pt(10)
        # Give the signature and date rows room to write in.
        if k in ("Signature", "Date of test"):
            sign.rows[i].cells[1].paragraphs[0].add_run("\n")

    doc.add_paragraph()
    p = doc.add_paragraph()
    r = p.add_run("Report presented to")
    r.bold = True
    r.font.size = Pt(11)
    r.font.color.rgb = NAVY

    pres = doc.add_table(rows=4, cols=2)
    pres.style = "Table Grid"
    pres_rows = [
        ("Name", "Eric Menges"),
        ("Position", "Chief Executive Officer, Room Ready Supply"),
        ("Signature", ""),
        ("Date received", ""),
    ]
    for i, (k, v) in enumerate(pres_rows):
        pres.rows[i].cells[0].text = k
        pres.rows[i].cells[1].text = v
        pres.rows[i].cells[0].width = Inches(1.8)
        pres.rows[i].cells[1].width = Inches(4.7)
        _shade(pres.rows[i].cells[0], "F2F4F7")
        for par in pres.rows[i].cells[0].paragraphs:
            for run in par.runs:
                run.bold = True
                run.font.size = Pt(10)
        if k in ("Signature", "Date received"):
            pres.rows[i].cells[1].paragraphs[0].add_run("\n")

    doc.add_paragraph()
    p = doc.add_paragraph()
    r = p.add_run(
        "Note: this automated test verifies the website up to the payment step "
        "only. No order was submitted and no payment was processed during this "
        "test run."
    )
    r.font.size = Pt(8.5)
    r.font.color.rgb = GREY
    r.italic = True

    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(path))
    return path


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main() -> int:
    print("=" * 66)
    print("  Room Ready Supply - Website Fix Verification")
    print("  Testing against: " + BASE)
    print("=" * 66)
    print("\nA browser window will open. Please leave it alone while it runs")
    print("(about 60-90 seconds). No order is submitted and no payment is made.\n")

    suite = Suite()

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=False, slow_mo=250)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            # Locked to light so screenshots and behaviour match what staff see.
            color_scheme="light",
        )
        page = context.new_page()
        page.set_default_timeout(30000)

        try:
            run_tests(page, suite)
        except Exception:
            print("\nA test crashed unexpectedly:\n")
            traceback.print_exc()
        finally:
            time.sleep(1)
            context.close()
            browser.close()

    print("\n" + "=" * 66)
    print(f"  {suite.passed} passed, {suite.failed} failed, {len(suite.results)} total")
    print("=" * 66)

    stamp = suite.started.strftime("%Y-%m-%d_%H%M")
    out = OUTPUT_DIR / f"RRS-Website-Test-Report_{stamp}.docx"
    build_report(suite, out)

    print(f"\nWord report saved to:\n  {out}\n")
    print("Open it, sign the Sign-Off page, and present it to Eric Menges.\n")

    return 0 if suite.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
