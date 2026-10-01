import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extendChart, cashAccount } from './accounts.ts';
import { entry, type Line } from './journal.ts';
import { dollars, csvField, journalCsv, trialBalanceCsv, exportBundle } from './export.ts';

const BOOKS = extendChart([cashAccount('1010', 'Cash — Operating')]);
const base = { by: 'treasurer', recordedAt: '2026-09-11T10:00:00.000Z' };
const post = (description: string, lines: Line[], source = 'test', date = '2026-09-10') =>
  entry({ ...base, date, description, lines, source }, BOOKS);

const GIFT = post('Gift from a donor', [
  { account: '1010', debitCents: 100_000 },
  { account: '4010', creditCents: 100_000, netAssets: 'without' },
]);
const SPEND = post('Pantry food', [
  { account: '5400', debitCents: 12_345, fn: 'program' },
  { account: '1010', creditCents: 12_345 },
], 'spend');

// ── Money ────────────────────────────────────────────────────────────────────

test('cents convert to dollars exactly, including the awkward ones', () => {
  // ⚠️ Integer arithmetic, not float division — this is the ONE place cents become dollars,
  // and a rounding artefact here is a figure that disagrees with the ledger it came from.
  assert.equal(dollars(123_456), '1234.56');
  assert.equal(dollars(7), '0.07');
  assert.equal(dollars(0), '0.00');
  assert.equal(dollars(100), '1.00');
  assert.equal(dollars(-12_345), '-123.45');
  assert.equal(dollars(999_999_999), '9999999.99');
});

// ── CSV safety ───────────────────────────────────────────────────────────────

test('a formula in a payee name is defused', () => {
  // ⚠️ These files carry donor names and bank descriptions — none of it ours — and Excel and
  // Sheets execute a cell beginning = + - or @ on open.
  assert.equal(csvField('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  for (const lead of ['=', '+', '-', '@']) {
    assert.ok(csvField(`${lead}danger`).startsWith(`"'${lead}`), `${lead} not defused`);
  }
});

test('quotes and commas survive the round trip', () => {
  assert.equal(csvField('He said "hi", then left'), '"He said ""hi"", then left"');
  assert.equal(csvField(''), '""');
});

test('a negative amount is defused without being corrupted', () => {
  // A leading `-` is both a formula character and a legitimate minus. It gets the apostrophe,
  // and the digits are untouched — a reader sees -123.45, Excel does not evaluate it.
  const f = csvField(dollars(-12_345));
  assert.equal(f, `"'-123.45"`);
  assert.ok(f.includes('123.45'));
});

// ── The journal ──────────────────────────────────────────────────────────────

test('the journal is one row per LINE, grouped by entry id', () => {
  const csv = journalCsv([GIFT, SPEND], BOOKS);
  const rows = csv.trim().split('\n');
  assert.equal(rows.length, 5, 'header + 2 lines + 2 lines');
  assert.match(rows[0]!, /^"Entry ID","Date","Description","Account code"/);
  // Both lines of one entry carry the same id, which is how an importer groups them.
  const giftRows = rows.filter((r) => r.includes(GIFT.id));
  assert.equal(giftRows.length, 2);
});

test('function and net asset class reach the export', () => {
  const csv = journalCsv([GIFT, SPEND], BOOKS);
  assert.match(csv, /"program"/, 'the Form 990 column');
  assert.match(csv, /"without"/, 'the ASU 2016-14 class');
});

test('entries are ordered by date so the ledger reads chronologically', () => {
  const later = post('Later', [{ account: '1010', debitCents: 100 },
    { account: '4010', creditCents: 100, netAssets: 'without' }], 'l', '2026-09-20');
  const earlier = post('Earlier', [{ account: '1010', debitCents: 100 },
    { account: '4010', creditCents: 100, netAssets: 'without' }], 'e', '2026-09-01');
  const rows = journalCsv([later, earlier], BOOKS).trim().split('\n');
  assert.ok(rows[1]!.includes('Earlier'), 'earliest first');
});

// ── The trial balance file ───────────────────────────────────────────────────

test('the trial balance totals, and the totals match', () => {
  const csv = trialBalanceCsv([GIFT, SPEND], BOOKS);
  assert.match(csv, /"TOTAL","","1123\.45","1123\.45"/);
  assert.doesNotMatch(csv, /OUT OF BALANCE/);
});

test('an out-of-balance ledger SAYS SO in the file', () => {
  // ⚠️ A file called "trial balance" that silently omits its own failure is worse than no
  // file — the recipient reasonably assumes it balances.
  const broken = { ...GIFT, lines: [{ account: '1010', debitCents: 100_000 }] };
  const csv = trialBalanceCsv([broken], BOOKS);
  assert.match(csv, /OUT OF BALANCE/);
  assert.match(csv, /must not be relied on/);
});

// ── The bundle ───────────────────────────────────────────────────────────────

test('the bundle carries four files and states what it does not prove', () => {
  const b = exportBundle([GIFT, SPEND], BOOKS, 'Example Nonprofit', '2026-09-30');
  assert.deepEqual(Object.keys(b).sort(),
    ['README.txt', 'chart-of-accounts.csv', 'journal.csv', 'trial-balance.csv']);
  // ⚠️ A bundle that overstates its scope invites reliance it cannot carry.
  assert.match(b['README.txt'], /WHAT THIS EXPORT DOES NOT CONTAIN/);
  assert.match(b['README.txt'], /Bank reconciliations/);
  assert.match(b['README.txt'], /not a compilation, review or audit/);
  assert.match(b['README.txt'], /Trial balance: BALANCED/);
});

test('an unbalanced bundle says so in its covering note', () => {
  // ⚠️ The first draft of this test passed its arguments in the wrong order and ended with
  // `assert.ok(true)` — it could not fail, which is the exact shape this repo refuses
  // elsewhere. Written properly it checks the thing that matters: a recipient opening the
  // README must see the problem before the file list.
  const broken = { ...GIFT, lines: [{ account: '1010', debitCents: 100_000 }] };
  const b = exportBundle([broken], BOOKS, 'Example Nonprofit', '2026-09-30');
  assert.match(b['README.txt'], /OUT BY 1000\.00/);
  assert.match(b['README.txt'], /DO NOT RELY ON THESE FIGURES/);
  // And the warning comes before the file list, so it cannot be scrolled past.
  assert.ok(b['README.txt'].indexOf('DO NOT RELY') < b['README.txt'].indexOf('FILES'));
  assert.match(b['trial-balance.csv'], /OUT OF BALANCE/);
});

test('the README names the basis and the two nonprofit rules', () => {
  const b = exportBundle([GIFT], BOOKS, 'Example Nonprofit', '2026-09-30');
  assert.match(b['README.txt'], /Form 990 Part IX/);
  assert.match(b['README.txt'], /ASU 2016-14/);
  assert.match(b['README.txt'], /integer cents/);
});
