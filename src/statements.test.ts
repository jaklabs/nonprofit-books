import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extendChart, cashAccount } from './accounts.ts';
import { entry, type JournalEntry, type Line } from './journal.ts';
import { statementOfActivities, functionalExpenses, financialPosition } from './statements.ts';

const BOOKS = extendChart([cashAccount('1010', 'Cash — Operating')]);
const base = { by: 'treasurer', recordedAt: '2026-09-11T10:00:00.000Z', source: 'test' };
let n = 0;
const post = (date: string, description: string, lines: Line[]): JournalEntry =>
  entry({ ...base, date, description, lines, source: `t${n++}` }, BOOKS);

/** $1,000 unrestricted gift. */
const gift = (date = '2026-09-02') => post(date, 'Unrestricted gift', [
  { account: '1010', debitCents: 100_000 },
  { account: '4010', creditCents: 100_000, netAssets: 'without' },
]);
/** $5,000 foundation grant, restricted to the housing programme. */
const grant = (date = '2026-09-03') => post(date, 'Foundation grant, restricted', [
  { account: '1010', debitCents: 500_000 },
  { account: '4100', creditCents: 500_000, netAssets: 'with' },
]);
/** $800 of programme spend. */
const spend = (date = '2026-09-10') => post(date, 'Client housing assistance', [
  { account: '5600', debitCents: 80_000, fn: 'program' },
  { account: '1010', creditCents: 80_000 },
]);
/** $200 of admin. */
const admin = (date = '2026-09-11') => post(date, 'Insurance premium', [
  { account: '5200', debitCents: 20_000, fn: 'management' },
  { account: '1010', creditCents: 20_000 },
]);
/**
 * Releasing $800 of the restricted grant, because the programme spent it.
 * ⚠️ Debits the WITH class and credits the WITHOUT class, in one balanced entry.
 */
const release = (date = '2026-09-10', cents = 80_000) =>
  post(date, 'Net assets released — housing programme spend', [
    { account: '4900', debitCents: cents, netAssets: 'with' },
    { account: '4900', creditCents: cents, netAssets: 'without' },
  ]);

const SEPT = ['2026-09-01', '2026-09-30'] as const;

// ── The rule people get wrong ────────────────────────────────────────────────

test('a release moves money BETWEEN classes and nets to zero overall', () => {
  // ⚠️ THE MOST COMMON NONPROFIT ACCOUNTING ERROR is reducing the restricted class directly
  // when restricted money is spent. It does not work that way: the restriction is satisfied
  // (a reclassification), and the expense then lands on the unrestricted class like any other.
  const a = statementOfActivities([release()], BOOKS, ...SEPT);
  assert.equal(a.revenueTotals.with, -80_000, 'restricted class goes down');
  assert.equal(a.revenueTotals.without, 80_000, 'unrestricted goes up by the same');
  assert.equal(a.changeTotalCents, 0, 'and the organisation is no richer');
});

test('expenses reduce the UNRESTRICTED class only, never the restricted one', () => {
  const a = statementOfActivities([grant(), spend(), release()], BOOKS, ...SEPT);
  // $5,000 restricted in, $800 released out → $4,200 still restricted.
  assert.equal(a.changeByClass.with, 420_000);
  // $800 released in, $800 spent → zero change to unrestricted.
  assert.equal(a.changeByClass.without, 0);
  assert.equal(a.changeTotalCents, 420_000);
});

test('spending restricted money WITHOUT releasing it leaves the classes wrong', () => {
  // The same facts, minus the release entry. The organisation looks like it spent $800 it
  // did not have unrestricted, while the restricted class never moves — which is exactly the
  // drift that leaves restricted net assets growing forever on a balance sheet nobody can
  // explain. The library cannot prevent this; the test documents the symptom.
  const a = statementOfActivities([grant(), spend()], BOOKS, ...SEPT);
  assert.equal(a.changeByClass.without, -80_000, 'unrestricted goes NEGATIVE');
  assert.equal(a.changeByClass.with, 500_000, 'restricted never moves');
});

// ── Statement of Activities ──────────────────────────────────────────────────

test('revenue is split by class and expenses are totalled', () => {
  const a = statementOfActivities([gift(), grant(), spend(), admin()], BOOKS, ...SEPT);
  assert.equal(a.revenueTotals.without, 100_000);
  assert.equal(a.revenueTotals.with, 500_000);
  assert.equal(a.expenseTotal, 100_000);
  assert.equal(a.changeTotalCents, 500_000);
  assert.equal(a.trustworthy, true);
});

test('entries outside the period are excluded', () => {
  const a = statementOfActivities(
    [gift('2026-08-31'), gift('2026-09-15'), gift('2026-10-01')], BOOKS, ...SEPT);
  assert.equal(a.revenueTotals.without, 100_000, 'one gift, not three');
});

test('an empty period is zero and still trustworthy', () => {
  const a = statementOfActivities([], BOOKS, ...SEPT);
  assert.equal(a.changeTotalCents, 0);
  assert.equal(a.trustworthy, true, 'nothing to be wrong');
});

// ── Functional expenses — the matrix ─────────────────────────────────────────

test('the matrix has natural rows and functional columns', () => {
  const fe = functionalExpenses([spend(), admin()], BOOKS, ...SEPT);
  assert.equal(fe.rows.length, 2, 'two natural categories');
  const housing = fe.rows.find((r) => r.code === '5600')!;
  assert.equal(housing.byFunction.program, 80_000);
  assert.equal(housing.byFunction.management, 0);
  assert.equal(fe.columnTotals.program, 80_000);
  assert.equal(fe.columnTotals.management, 20_000);
  assert.equal(fe.totalCents, 100_000);
  assert.equal(fe.programRatio, 0.8);
});

test('one natural account can split across functions', () => {
  // The director's salary is the canonical case: part programme, part administration, and
  // the split must rest on a stated basis (a time log), not a feel.
  const split = post('2026-09-20', "Director's salary, 70/30 per September time log", [
    { account: '5010', debitCents: 70_000, fn: 'program', memo: 'per time log' },
    { account: '5010', debitCents: 30_000, fn: 'management', memo: 'per time log' },
    { account: '1010', creditCents: 100_000 },
  ]);
  const fe = functionalExpenses([split], BOOKS, ...SEPT);
  const row = fe.rows.find((r) => r.code === '5010')!;
  assert.equal(row.byFunction.program, 70_000);
  assert.equal(row.byFunction.management, 30_000);
  assert.equal(row.totalCents, 100_000);
});

test('no spending gives a NULL ratio, not zero', () => {
  // ⚠️ 0 would read as "nothing goes to programmes". Null reads as "nothing was spent".
  const fe = functionalExpenses([gift()], BOOKS, ...SEPT);
  assert.equal(fe.programRatio, null);
  assert.equal(fe.totalCents, 0);
});

test('the matrix total equals the activities expense total', () => {
  // Two independent paths to the same number; if they disagree one of them is wrong.
  const es = [gift(), grant(), spend(), admin()];
  assert.equal(functionalExpenses(es, BOOKS, ...SEPT).totalCents,
               statementOfActivities(es, BOOKS, ...SEPT).expenseTotal);
});

// ── Financial position ───────────────────────────────────────────────────────

test('assets equal liabilities plus net assets', () => {
  const es = [gift(), grant(), spend(), admin(), release()];
  const fp = financialPosition(es, BOOKS, '2026-09-30');
  // $1,000 + $5,000 in, $800 + $200 out = $5,000 cash.
  assert.equal(fp.totalAssetsCents, 500_000);
  assert.equal(fp.totalLiabilitiesCents, 0);
  assert.equal(fp.totalNetAssetsCents, 500_000);
  assert.equal(fp.balances, true);
  assert.equal(fp.trustworthy, true);
});

test('net assets carry their classes onto the balance sheet', () => {
  const fp = financialPosition([gift(), grant(), spend(), release()], BOOKS, '2026-09-30');
  // $1,000 unrestricted + $800 released − $800 spent = $1,000 unrestricted.
  assert.equal(fp.netAssets.without, 100_000);
  // $5,000 restricted − $800 released = $4,200.
  assert.equal(fp.netAssets.with, 420_000);
});

test('financial position is CUMULATIVE, not periodic', () => {
  // ⚠️ A balance sheet is a position, not a flow. Treating it as a window would produce a
  // plausible-looking document describing nothing real.
  const es = [gift('2026-08-05'), gift('2026-09-05')];
  assert.equal(financialPosition(es, BOOKS, '2026-09-30').totalAssetsCents, 200_000,
    'both gifts, including the one before September');
  assert.equal(financialPosition(es, BOOKS, '2026-08-31').totalAssetsCents, 100_000,
    'and nothing after the as-of date');
});

test('a liability keeps the sheet balanced', () => {
  const deferred = post('2026-09-04', 'Grant received before its conditions are met', [
    { account: '1010', debitCents: 300_000 },
    { account: '2300', creditCents: 300_000 },
  ]);
  const fp = financialPosition([deferred], BOOKS, '2026-09-30');
  assert.equal(fp.totalAssetsCents, 300_000);
  assert.equal(fp.totalLiabilitiesCents, 300_000);
  assert.equal(fp.totalNetAssetsCents, 0, 'deferred revenue is NOT income');
  assert.equal(fp.balances, true);
});
