import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHART, extendChart, cashAccount } from './accounts.ts';
import {
  entry, checkEntry, trialBalance, inPeriod, sumDebits, sumCredits, PostingRefused,
  type JournalEntry, type Line,
} from './journal.ts';

const BOOKS = extendChart([
  cashAccount('1010', 'Cash — Operating'),
  cashAccount('1020', 'Cash — Programme'),
]);

const base = { date: '2026-09-10', by: 'treasurer', recordedAt: '2026-09-11T10:00:00.000Z',
               source: 'test', description: 'A thing that happened' };
const make = (lines: Line[], over: Partial<JournalEntry> = {}) =>
  entry({ ...base, ...over, lines }, BOOKS);

/** $500 donation received into the operating account, unrestricted. */
const DONATION: Line[] = [
  { account: '1010', debitCents: 50_000 },
  { account: '4010', creditCents: 50_000, netAssets: 'without' },
];
/** $120 of pantry food paid from the operating account. */
const GROCERIES: Line[] = [
  { account: '5400', debitCents: 12_000, fn: 'program' },
  { account: '1010', creditCents: 12_000 },
];

// ── Rule 1: debits must equal credits ────────────────────────────────────────

test('a balanced entry is accepted', () => {
  const e = make(DONATION);
  assert.equal(sumDebits(e.lines), 50_000);
  assert.equal(sumCredits(e.lines), 50_000);
});

test('an unbalanced entry is REFUSED, and says by how much', () => {
  // ⚠️ One unbalanced entry makes the trial balance meaningless, and the trial balance is the
  // first thing a CPA checks. The error then compounds silently through every later report.
  assert.throws(
    () => make([{ account: '1010', debitCents: 50_000 },
                { account: '4010', creditCents: 49_999, netAssets: 'without' }]),
    (e: Error) => e instanceof PostingRefused && /out by 1 cent\b/.test(e.message));
});

test('one cent out is out — there is no tolerance', () => {
  assert.throws(() => make([{ account: '1010', debitCents: 1 },
                            { account: '4010', creditCents: 2, netAssets: 'without' }]),
    PostingRefused);
});

test('a zero entry records nothing and is refused', () => {
  assert.throws(() => make([{ account: '1010', debitCents: 0, creditCents: 0 }]), PostingRefused);
});

// ── Rule 2: every expense carries a function ─────────────────────────────────

test('an expense WITHOUT a function is refused, with the reason', () => {
  // ⚠️ Form 990 Part IX requires the split and it cannot be worked out later — whether a
  // grocery bill fed the pantry or a staff meeting is not in the transaction.
  assert.throws(
    () => make([{ account: '5400', debitCents: 12_000 },
                { account: '1010', creditCents: 12_000 }]),
    (e: Error) => e instanceof PostingRefused
      && /needs a function/.test(e.message)
      && /cannot be worked out later/.test(e.message));
});

test('each of the three functions is accepted', () => {
  for (const fn of ['program', 'management', 'fundraising'] as const) {
    const e = make([{ account: '5400', debitCents: 100, fn },
                    { account: '1010', creditCents: 100 }]);
    assert.equal(e.lines[0]!.fn, fn);
  }
});

test('a NON-expense carrying a function is refused', () => {
  // Allowing it would put non-expenses into the functional expense matrix, where the
  // program ratio is computed — inflating or deflating the number everyone reads.
  assert.throws(
    () => make([{ account: '1010', debitCents: 50_000, fn: 'program' },
                { account: '4010', creditCents: 50_000, netAssets: 'without' }]),
    (e: Error) => e instanceof PostingRefused && /takes no function/.test(e.message));
});

// ── Rule 3: every revenue line carries a net asset class ─────────────────────

test('revenue WITHOUT a net asset class is refused', () => {
  // ⚠️ ASU 2016-14. The restriction lives in the gift letter, not the bank feed, so it has to
  // be recorded at the moment somebody knows it.
  assert.throws(
    () => make([{ account: '1010', debitCents: 50_000 },
                { account: '4010', creditCents: 50_000 }]),
    (e: Error) => e instanceof PostingRefused
      && /needs a net asset class/.test(e.message)
      && /gift letter/.test(e.message));
});

test('both classes are accepted, and nothing else is inferred', () => {
  for (const netAssets of ['with', 'without'] as const) {
    const e = make([{ account: '1010', debitCents: 50_000 },
                    { account: '4100', creditCents: 50_000, netAssets }]);
    assert.equal(e.lines[1]!.netAssets, netAssets);
  }
  // ⚠️ `usuallyRestricted` on the account is a DEFAULT FOR A UI, never a conclusion. The
  // library must not quietly supply it — the donor decides, per gift.
  assert.throws(() => make([{ account: '1010', debitCents: 50_000 },
                            { account: '4100', creditCents: 50_000 }]), PostingRefused);
});

test('a non-revenue line carrying a net asset class is refused', () => {
  assert.throws(
    () => make([{ account: '1010', debitCents: 100, netAssets: 'without' },
                { account: '4010', creditCents: 100, netAssets: 'without' }]),
    (e: Error) => e instanceof PostingRefused && /takes no net asset class/.test(e.message));
});

// ── Shape of a line ──────────────────────────────────────────────────────────

test('a line must be exactly one side', () => {
  assert.throws(() => make([{ account: '1010', debitCents: 100, creditCents: 100 },
                            { account: '4010', creditCents: 100, netAssets: 'without' }]),
    /exactly one of debit or credit/);
});

test('a negative amount is refused rather than treated as the other side', () => {
  // ⚠️ A negative debit is a credit in disguise. Two ways to express one posting means every
  // report has to handle both, and one of them eventually will not.
  assert.throws(() => make([{ account: '1010', debitCents: -100 },
                            { account: '4010', creditCents: -100, netAssets: 'without' }]),
    /must be positive/);
});

test('dollars are refused — amounts are integer cents', () => {
  assert.throws(() => make([{ account: '1010', debitCents: 12.34 },
                            { account: '4010', creditCents: 12.34, netAssets: 'without' }]),
    /integer CENTS/);
});

test('an unknown account is refused', () => {
  // ⚠️ Posting to an account no chart defines puts money where no statement reports it —
  // and the trial balance still balances, so nothing looks wrong.
  assert.throws(() => make([{ account: '9999', debitCents: 100 },
                            { account: '4010', creditCents: 100, netAssets: 'without' }]),
    /no account 9999/);
});

// ── Provenance ───────────────────────────────────────────────────────────────

test('an entry must say who made it and what happened', () => {
  assert.throws(() => make(DONATION, { by: '  ' }), /who made it/);
  assert.throws(() => make(DONATION, { description: '' }), /needs a description/);
  assert.throws(() => make(DONATION, { date: '30/09/2026' }), /must be YYYY-MM-DD/);
});

test('source travels with the entry, so it can be traced to evidence', () => {
  const e = make(DONATION, { source: 'plaid:2026-09-30T19-41-50-010Z-0' });
  assert.equal(e.source, 'plaid:2026-09-30T19-41-50-010Z-0');
});

// ── Trial balance ────────────────────────────────────────────────────────────

test('the trial balance balances, and reports each account in its normal direction', () => {
  const tb = trialBalance([make(DONATION), make(GROCERIES)], BOOKS);
  assert.equal(tb.balanced, true);
  assert.equal(tb.differenceCents, 0);
  assert.equal(tb.totalDebitsCents, 62_000);
  assert.equal(tb.totalCreditsCents, 62_000);

  const cash = tb.accounts.find((a) => a.code === '1010')!;
  // Asset: normal balance is a debit, so $500 in less $120 out = $380.
  assert.equal(cash.balanceCents, 38_000);

  const rev = tb.accounts.find((a) => a.code === '4010')!;
  // ⚠️ Revenue is a CREDIT balance. Reporting it negative is the single most common error
  // here, because "income went up" feels like a debit.
  assert.equal(rev.balanceCents, 50_000);

  const exp = tb.accounts.find((a) => a.code === '5400')!;
  assert.equal(exp.balanceCents, 12_000);
});

test('an empty ledger balances trivially and says it has no entries', () => {
  const tb = trialBalance([], BOOKS);
  assert.equal(tb.balanced, true);
  assert.equal(tb.entries, 0);
  assert.deepEqual(tb.accounts, []);
});

test('a posting to an account later removed from the chart is REPORTED, not dropped', () => {
  // ⚠️ Dropping it would silently unbalance the trial balance — the one thing it exists to
  // prove. It is surfaced with a marker in the name instead.
  const e = { ...base, id: 'x', lines: [
    { account: '1010', debitCents: 100 }, { account: '4010', creditCents: 100, netAssets: 'without' as const },
  ] };
  checkEntry(e, BOOKS);
  const narrower = BOOKS.filter((a) => a.code !== '4010');
  const tb = trialBalance([e], narrower);
  assert.equal(tb.balanced, true, 'still balances — the money did not move');
  assert.match(tb.accounts.find((a) => a.code === '4010')!.name, /not in this chart/);
});

test('many entries still balance to the cent', () => {
  const entries = Array.from({ length: 250 }, (_, i) =>
    make([{ account: '5400', debitCents: 7, fn: 'program' },
          { account: '1010', creditCents: 7 }], { source: `t${i}` }));
  const tb = trialBalance(entries, BOOKS);
  assert.equal(tb.balanced, true);
  assert.equal(tb.totalDebitsCents, 1_750, 'exact — integer cents, no float drift');
});

// ── Periods ──────────────────────────────────────────────────────────────────

test('periods are string comparisons, so there is no timezone to get wrong', () => {
  const es = ['2026-08-31', '2026-09-01', '2026-09-30', '2026-10-01']
    .map((date, i) => make(DONATION, { date, source: `d${i}` }));
  assert.deepEqual(inPeriod(es, '2026-09-01', '2026-09-30').map((e) => e.date),
    ['2026-09-01', '2026-09-30']);
});
