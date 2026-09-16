# How to run the website test

This test opens a browser, checks the fixes on **roomreadysupply.com**, and
writes a Word report you can sign and give to Eric.

It takes about 90 seconds. You only do the setup (Part 1) **once** — after
that, running the test is two clicks.

> **It is safe to run on the live site.** The test never submits an order and
> never enters payment details. It checks everything up to the payment step and
> stops there.

---

## Part 1 — One-time setup

You only ever do this once on this computer.

### Step 1. Open the project in VS Code

Open VS Code → **File → Open Folder** → choose:

```
C:\Users\rguti\OneDrive\Documents\RRS-Website
```

### Step 2. Open the Terminal inside VS Code

Press **Ctrl + `** (the key above Tab, left of the number 1).

A panel opens at the bottom. That is the Terminal — you type commands there.

### Step 3. Install the two tools the test needs

Copy this line, paste it into the Terminal, press **Enter**:

```
pip install playwright python-docx
```

Wait for it to finish (a minute or so). Then copy this line, paste, **Enter**:

```
python -m playwright install chromium
```

This downloads the browser the test drives. It is a large download the first
time — let it finish.

**Setup is done.** You never need to repeat Part 1.

---

## Part 2 — Running the test

Every time you want to test the site:

1. Open the project folder in VS Code (Part 1, Step 1)
2. Open the Terminal (**Ctrl + `**)
3. Type this and press **Enter**:

```
python tests/test_website_fixes.py
```

### What you will see

A browser window opens and moves through the site by itself. **Don't touch it**
— clicking or typing while it runs can make a test fail for the wrong reason.

In the Terminal, results appear as they happen:

```
Checkout wording and flow
  [PASS] TC-01  Checkout heading describes a purchase, not a request
  [PASS] TC-02  Submit button names the payment step
  ...

==================================================================
  17 passed, 0 failed, 17 total
==================================================================

Word report saved to:
  C:\Users\rguti\Downloads\RRS-Website-Test-Report_2026-09-16_2128.docx
```

The browser closes on its own when it finishes.

---

## Part 3 — The report

The Word file lands in your **Downloads** folder. The filename includes the date
and time, so each run is kept separately and nothing is overwritten.

The report contains:

| Section | What's in it |
|---|---|
| Run details | Date, time, environment, pass/fail totals |
| Test results | All 17 cases in a table with PASS/FAIL |
| Detailed findings | What was expected, what was actually seen, and why each test exists |
| **Sign-Off** | Blank fields for your name, role, signature and date |
| **Report presented to** | Pre-filled for Eric Menges, CEO, with signature and date-received fields |

Open it, fill in the Sign-Off page, print or sign it digitally, and give it to
Eric.

---

## What each test checks

| Ref | Audit item | What it verifies |
|---|---|---|
| TC-01 | 1, 15 | Checkout heading no longer says "Order Request" |
| TC-02 | 1, 15 | Submit button says "Continue to Payment" |
| TC-03 | 14 | Delivery acknowledgment states the real 3–5 day window |
| TC-04 | 13 | Phone placeholder isn't RRS's own number |
| TC-05 | 12 | Business name is optional |
| TC-06 | 2 | Total is labelled as excluding delivery |
| TC-07 | 2, 5 | Delivery line says how shipping is priced |
| TC-08 | 2 | Sales tax calculates once a state is chosen |
| TC-09 | 7 | Adding to cart shows a real confirmation |
| TC-10 | 3 | Cart icon actually navigates when clicked |
| TC-11 | 16 | Cart page title says "Your Cart" |
| TC-12 | 17 | Marketing opt-in is not pre-checked |
| TC-13 | CEO | Affiliate site names the affiliate above the RRS logo |
| TC-14 | CEO | Affiliate site states RRS is only the supplier |
| TC-15 | CEO | That disclaimer does **not** appear on the main site |
| TC-16 | — | Catalog collapses product sizes into one card |
| TC-17 | 1 | Payment page loads Stripe card and ACH fields |

---

## If something goes wrong

**"python is not recognized"**
Python isn't on your PATH. Try `py` instead of `python`:
```
py tests/test_website_fixes.py
```

**"Missing dependency: playwright"** or **"Missing dependency: python-docx"**
Part 1, Step 3 didn't complete. Run it again.

**"Executable doesn't exist" / browser errors**
The browser download didn't finish. Run:
```
python -m playwright install chromium
```

**A test says FAIL**
Read the **Observed** line for that test in the report — it says exactly what was
found instead of what was expected. A FAIL means either the site genuinely
changed, or the site was slow to load that moment. Run it again first; if it
fails twice, it's real.

**The browser opens but nothing happens**
Check your internet connection — the test loads the live website.

---

## Running it against a copy of the site instead of live

Near the top of `test_website_fixes.py`:

```python
BASE = "https://www.roomreadysupply.com"
AFFILIATE_BASE = "https://trustmarkcleaners.roomreadysupply.com"
```

Change `BASE` to test a staging site instead. Leave it as-is to test live.
