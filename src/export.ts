/**
 * Getting the books out, in a shape somebody else's software will accept.
 *
 * ⚠️ THIS IS THE POINT OF THE LIBRARY, NOT AN AFTERTHOUGHT. A compilation costs what it costs
 * because a CPA has to assemble and verify the underlying records. Handing them a balanced
 * general ledger, a trial balance and the reconciliations turns that into a review. Handing
 * them a bank export turns it into bookkeeping they bill for.
 *
 * ⚠️ EVERY FIELD IS QUOTED AND FORMULA-DEFUSED. A CSV opened in Excel or Sheets will execute
 * a cell beginning `=`, `+`, `-` or `@`, and these files contain donor names and payee
 * descriptions that came from outside. The care plane's claim worksheet does the same thing
 * for the same reason.
 *
 * ⚠️ AMOUNTS ARE WRITTEN AS DOLLARS, because that is what every accounting package expects on
 * import — and this is the ONLY place cents are converted. Doing it here, once, at the
 * boundary, is what keeps every calculation upstream exact.
 */
import { findAccount, type Account } from './accounts.ts';
import { trialBalance, type JournalEntry } from './journal.ts';

/** `1234` → `"12.34"`. Exact: integer arithmetic, no float division of the whole amount. */
export function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * One CSV field.
 *
 * ⚠️ The leading apostrophe on `=+-@` is not decoration. A payee called
 * `=HYPERLINK("http://…")` is a working formula in Excel, and these files carry text from
 * donors, vendors and bank feeds — none of it ours.
 */
export function csvField(v: string | number): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

const csvRow = (cells: (string | number)[]): string => cells.map(csvField).join(',');

/**
 * The general ledger, one row per journal LINE.
 *
 * Line-per-row rather than entry-per-row because that is what an import expects: the entry is
 * identified by its id repeating down the rows, and the importer groups on it. Collapsing to
 * one row per entry would lose the account breakdown, which is the only part that matters.
 */
export function journalCsv(entries: JournalEntry[], chart: Account[]): string {
  const rows = [csvRow([
    'Entry ID', 'Date', 'Description', 'Account code', 'Account name', 'Account type',
    'Debit', 'Credit', 'Function', 'Net asset class', 'Memo', 'Recorded by', 'Recorded at',
    'Source',
  ])];
  for (const e of [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    for (const l of e.lines) {
      const a = findAccount(chart, l.account);
      rows.push(csvRow([
        e.id, e.date, e.description,
        l.account, a?.name ?? '⚠️ not in chart', a?.type ?? '',
        l.debitCents ? dollars(l.debitCents) : '',
        l.creditCents ? dollars(l.creditCents) : '',
        l.fn ?? '', l.netAssets ?? '', l.memo ?? '',
        e.by, e.recordedAt, e.source,
      ]));
    }
  }
  return rows.join('\n') + '\n';
}

/**
 * The trial balance — the first thing a CPA checks.
 *
 * ⚠️ IT WRITES THE OUT-OF-BALANCE LINE WHEN IT IS OUT OF BALANCE, rather than omitting it.
 * A trial balance that silently drops its own failure is worse than no file: the recipient
 * reasonably assumes a file called "trial balance" balances.
 */
export function trialBalanceCsv(entries: JournalEntry[], chart: Account[]): string {
  const tb = trialBalance(entries, chart);
  const rows = [csvRow(['Account code', 'Account name', 'Type', 'Debit', 'Credit', 'Balance'])];
  for (const a of tb.accounts) {
    rows.push(csvRow([a.code, a.name, a.type,
      a.debitCents ? dollars(a.debitCents) : '',
      a.creditCents ? dollars(a.creditCents) : '',
      dollars(a.balanceCents)]));
  }
  rows.push(csvRow(['', 'TOTAL', '', dollars(tb.totalDebitsCents), dollars(tb.totalCreditsCents), '']));
  if (!tb.balanced) {
    rows.push(csvRow(['', '⚠️ OUT OF BALANCE — these books do not balance and must not be relied on',
      '', '', '', dollars(tb.differenceCents)]));
  }
  return rows.join('\n') + '\n';
}

/** The chart itself, so a recipient can map it to their own. */
export function chartCsv(chart: Account[]): string {
  const rows = [csvRow(['Code', 'Name', 'Type', 'Note'])];
  for (const a of chart) rows.push(csvRow([a.code, a.name, a.type, a.note ?? '']));
  return rows.join('\n') + '\n';
}

export interface ExportBundle {
  'journal.csv': string;
  'trial-balance.csv': string;
  'chart-of-accounts.csv': string;
  'README.txt': string;
}

/**
 * Everything a CPA needs, with a covering note.
 *
 * ⚠️ THE README STATES WHAT THESE FILES DO NOT PROVE. A bundle that overstates its own scope
 * invites reliance it cannot carry — the same reason `quarry audit --counsel` ends by saying
 * what it cannot show. Bank reconciliations and supporting documents are not in here, and the
 * covering note says so rather than letting their absence be discovered later.
 */
export function exportBundle(
  entries: JournalEntry[], chart: Account[], org: string, asOf: string,
): ExportBundle {
  const tb = trialBalance(entries, chart);
  const readme = `${org} — general ledger export
As of: ${asOf}
Generated: ${new Date().toISOString()}
Entries: ${tb.entries}
Trial balance: ${tb.balanced ? 'BALANCED' : `⚠️ OUT BY ${dollars(tb.differenceCents)} — DO NOT RELY ON THESE FIGURES`}

FILES
  journal.csv             every journal line, grouped by entry id
  trial-balance.csv       account balances and the debit/credit totals
  chart-of-accounts.csv   the chart these entries are posted against

BASIS AND CONVENTIONS
  Amounts are US dollars. Internally the ledger is integer cents; this export is the only
  place a conversion happens.
  Every expense line carries a FUNCTION (program / management & general / fundraising) for
  Form 990 Part IX.
  Every revenue line carries a NET ASSET CLASS (with / without donor restrictions) per FASB
  ASU 2016-14. Expenses are always a decrease in net assets WITHOUT donor restrictions;
  restricted amounts are reclassified through "net assets released from restriction" first.

WHAT THIS EXPORT DOES NOT CONTAIN
  Bank reconciliations and the statements behind them.
  Supporting documents: grant agreements, leases, licences, payroll records.
  Any allocation basis for expenses split across functions. Where a natural account is split,
  the basis belongs in a written allocation policy, not in this file.
  An opinion of any kind. These are books, not a compilation, review or audit.
`;
  return {
    'journal.csv': journalCsv(entries, chart),
    'trial-balance.csv': trialBalanceCsv(entries, chart),
    'chart-of-accounts.csv': chartCsv(chart),
    'README.txt': readme,
  };
}
