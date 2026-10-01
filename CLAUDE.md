# nonprofit-books — double-entry bookkeeping for US nonprofits

A **library**, not an application. Zero dependencies, integer cents, TypeScript.

⚠️ **This repository is PUBLIC.** Nothing identifying a client organisation belongs in it —
not in code, not in tests, not in a commit message. Fixtures use generic names
(`Example Nonprofit`, `treasurer`, `Cash — Operating`) for that reason, and the one real
figure that reached an early draft was a client's confidential funding position. The consuming
application's own repo is where organisation-specific detail lives.

## The three rules it exists to enforce
1. **Debits equal credits**, integer cents, or the entry is refused.
2. **Every expense line carries a FUNCTION** — program / management & general / fundraising.
3. **Every revenue line carries a NET ASSET CLASS** — with / without donor restrictions.

⚠️ **Rules 2 and 3 cannot be reconstructed from a bank feed.** The function lives in what the
money was *for*; the restriction lives in the gift letter. Both are refused at **posting**
time rather than validated at reporting time, because by the time a report runs the person who
knew the answer has moved on. That enforcement is the entire reason this is a library rather
than a convention.

## ⚠️ The rule most often got wrong
**Expenses are ALWAYS a decrease in net assets WITHOUT donor restrictions.** Spending a
restricted grant does not reduce the restricted class directly — the restriction is first
*released* (a reclassification netting to zero), then the expense lands on the unrestricted
class like any other. Account `4900` models the release as one balanced entry debiting *with*
and crediting *without*. Skip it and restricted net assets grow forever.

`statements.test.ts` documents the symptom of skipping it, deliberately.

## ✅ Status — citations verified 1 Oct 2026
All nine queued claims were checked against published sources. **Three produced corrections to
shipped code**, all in account notes:

- **2300** — CONDITIONAL ≠ RESTRICTED. ASU 2018-08 requires **both** a barrier *and* a right of
  return/release for a contribution to be conditional (and therefore deferred revenue). A
  merely purpose-restricted grant is **revenue with donor restrictions on receipt**. The old
  note conflated the two, which is a common restatement.
- **3030** — ASU 2016-14 **requires board-designated amounts to be disclosed**, on the face or
  in the notes. It is a tracked subtotal, not an invisible one.
- **4300** — ASU 2020-07 verified: separate line item, **disaggregated by category**, with
  ASC 820 valuation technique and inputs disclosed per category.

⚠️ **Verification is not advice.** The standards say what this library says they say. Whether a
given transaction falls under them is the organisation's accountant's judgement.

⚠️ The chart is a deliberate simplification of **UCOA** (NCCS + California Association of
Nonprofits, 200+ accounts cross-referenced to Form 990). ~34 accounts, same 990 lines.

## Constraints that outrank convenience
- **Integer cents everywhere.** `dollars()` in `export.ts` is the ONLY conversion, at the
  export boundary. A trial balance out by a fraction of a cent is indistinguishable from a
  missing transaction.
- **One cash account per real bank account.** A combined "Cash" cannot be reconciled against
  anything a bank issues, which removes the only completeness check the books have.
- **CSV fields are formula-defused** (`=+-@`). Exports carry donor names and bank descriptions
  from outside.
- **The export states what it does not prove** — no reconciliations, no supporting documents,
  no opinion. A bundle that overstates its scope invites reliance it cannot carry.
- ⚠️ **This library never decides which books are official.** It makes a CPA compilation cheap
  by handing over a balanced ledger instead of a bank export. Quietly becoming the book of
  record for a 501(c)(3) because nobody chose it is the outcome to avoid.

## Conventions
`npm test` · `npm run typecheck`. Commit the **why**, not just the what.

**MIT licensed** (JD's call, 1 Oct 2026). ⚠️ That grant is effectively irreversible — future
versions can be relicensed, but every copy already obtained stays MIT forever. Anyone may fork
this and build a competing product with no obligation to contribute back. That is a different
trade from [[quarry]]'s AGPL + CC BY-SA, which was chosen precisely to make the register's
share-alike follow into client deliverables; the lever here is the implementation, not the
licence.

⚠️ **NOT on npm.** `package.json` keeps `"private": true`, which blocks `npm publish` and
nothing else. Putting it on the registry is a separate outward-facing decision.

⚠️ **Commercialising this is a separate decision**, and not one to drift into. Extract a
product only after it has worked for a real organisation.
