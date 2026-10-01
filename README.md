# nonprofit-books

Double-entry bookkeeping for US nonprofits. Zero dependencies, integer cents, TypeScript.

```ts
import { extendChart, cashAccount, entry, trialBalance, exportBundle } from 'nonprofit-books';

const chart = extendChart([cashAccount('1010', 'Cash — Operating')]);

const gift = entry({
  date: '2026-09-02', description: 'Unrestricted gift', by: 'treasurer',
  recordedAt: new Date().toISOString(), source: 'plaid:txn-abc',
  lines: [
    { account: '1010', debitCents: 100_000 },
    { account: '4010', creditCents: 100_000, netAssets: 'without' },
  ],
}, chart);
```

## What it enforces, and why that is the point

A general ledger enforces one rule: debits equal credits. Nonprofit bookkeeping needs two
more, and **neither can be reconstructed afterwards from a bank feed**:

| Rule | Why it cannot wait |
|---|---|
| Every **expense** line carries a **function** — program / management & general / fundraising | Form 990 Part IX requires the split, and the program-expense ratio derived from it is the first number funders and charity raters read. Whether a grocery bill fed the food pantry or a staff meeting is not in the transaction. |
| Every **revenue** line carries a **net asset class** — with / without donor restrictions | FASB ASU 2016-14. The restriction lives in the gift letter, not the bank feed. Spending restricted money as if it were unrestricted breaches a donor agreement; it is not a presentation error. |

Both are **refused at posting time**, not validated at reporting time. By the time a report is
run, the person who knew the answer has moved on.

## The rule most often got wrong

**Expenses are always a decrease in net assets WITHOUT donor restrictions.** Spending a
restricted grant does not reduce the restricted class directly. Two things happen:

1. the restriction is satisfied, so the amount is **released** — reclassified from "with" to
   "without", netting to zero across the organisation;
2. the expense is recorded against the unrestricted class, like any other.

Account `4900` models the release as a single balanced entry debiting the *with* class and
crediting the *without* class. Skip it and restricted net assets grow forever on a balance
sheet nobody can explain.

## What you get

- `trialBalance()` — the first thing a CPA checks, with `balanced` as a hard boolean
- `statementOfActivities()` — revenue by class, expenses, change in net assets
- `functionalExpenses()` — the natural × functional matrix ASU 2016-14 requires
- `financialPosition()` — assets = liabilities + net assets, **cumulative**, not periodic
- `exportBundle()` — journal, trial balance and chart as CSV, plus a covering note

## Design notes

**Integer cents everywhere.** Floats drift, and a trial balance out by a fraction of a cent is
indistinguishable — to whoever is reconciling it — from a missing transaction. `dollars()` in
`export.ts` is the only conversion, at the boundary.

**One cash account per real bank account.** A combined "Cash" cannot be reconciled against
anything a bank issues, which removes the only completeness check the books have.

**CSV fields are formula-defused.** Exports carry donor names and bank descriptions from
outside; Excel and Sheets execute a cell beginning `=`, `+`, `-` or `@`.

**The export states what it does not prove.** No reconciliations, no supporting documents, no
opinion. A bundle that overstates its scope invites reliance it cannot carry.

## ⚠️ Status and scope

**v0.1.0. The accounting standards cited here were verified against published sources on
1 Oct 2026** — ASU 2016-14 (two net asset classes; the expense analysis by both natural and
functional classification required of *all* NFPs, not only voluntary health and welfare
organisations), ASU 2018-08 (conditional vs unconditional), ASU 2020-07 (contributed
nonfinancial assets), and AICPA SSARS AR-C 80 (compilations).

⚠️ **Verification is not advice.** The standards say what this library says they say; whether
a given transaction falls under them is a judgement for the organisation's accountant. The
chart of accounts is also a deliberate simplification — the sector standard is the **Unified
Chart of Accounts (UCOA)**, published by the National Center for Charitable Statistics and the
California Association of Nonprofits, which runs to 200+ accounts cross-referenced to Form 990
line items. This chart is ~34 accounts hitting the same 990 lines; map to UCOA if a funder or
accountant asks for it.

**This is bookkeeping preparation, not a replacement for an accountant.** It exists to make a
CPA compilation cheap by handing over a balanced ledger instead of a bank export. Which set of
books is the official one is the organisation's decision and its CPA's, never this library's.

Not yet used in anger. In production with one organisation; not yet a general-purpose package.

## Licence

**MIT.** Use it, fork it, build on it, sell what you build. See `LICENSE`.

⚠️ **The warranty disclaimer is not boilerplate here.** This library helps produce figures that
go into a Form 990 and in front of funders, and its accounting citations are **not
independently verified** (see Status above). It enforces that entries balance and that the two
nonprofit dimensions are present — it cannot tell you that your chart of accounts is right for
your organisation, that your functional allocation basis is defensible, or that your
classifications are correct. Those are an accountant's job, and this is designed to make that
job cheaper rather than to replace it.

Not on npm yet — `package.json` has `"private": true` so nothing is published accidentally.
Install from git if you want it today.
