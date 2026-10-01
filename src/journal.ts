/**
 * Double-entry, with the two rules that make it nonprofit bookkeeping.
 *
 * Three things are refused rather than warned about, because each produces a financial
 * statement that is wrong in a way nothing downstream can detect:
 *
 *   1. **Debits must equal credits.** An unbalanced entry makes the trial balance — the first
 *      thing a CPA checks — meaningless, and the error compounds silently across every later
 *      report.
 *   2. **Every expense line carries a FUNCTION** (program / management & general /
 *      fundraising). Form 990 Part IX requires the split, and the program ratio derived from
 *      it is the first number funders and charity raters read.
 *   3. **Every revenue line carries a NET ASSET CLASS** (with / without donor restrictions).
 *      FASB ASU 2016-14. Spending restricted money as though it were unrestricted is a real
 *      breach of a donor agreement, not a presentation error.
 *
 * ⚠️ RULES 2 AND 3 CANNOT BE RECONSTRUCTED LATER. A bank feed knows $5,000 arrived; it cannot
 * know whether the donor attached a condition, and it cannot know whether a grocery bill fed
 * the food pantry or a staff meeting. Both facts live outside the transaction — in the gift
 * letter and in somebody's memory — so they must be captured when the entry is made or they
 * are gone. Enforcing them here is the whole reason this is a library rather than a
 * convention.
 *
 * ⚠️ MONEY IS INTEGER CENTS THROUGHOUT. Floats drift, and a trial balance that is out by a
 * fraction of a cent is indistinguishable, to whoever is reconciling it, from a missing
 * transaction.
 */
import {
  NORMAL_BALANCE, requiresFunction, requiresNetAssetClass, findAccount,
  type Account, type FunctionCol, type NetAssetClass,
} from './accounts.ts';

export class PostingRefused extends Error {}

export interface Line {
  /** Account code, as it appears in the chart this entry is posted against. */
  account: string;
  /** Exactly one of these is non-zero, in integer cents. */
  debitCents?: number;
  creditCents?: number;
  /** Required on expense lines. Form 990 Part IX column. */
  fn?: FunctionCol;
  /** Required on revenue lines. FASB ASU 2016-14 class. */
  netAssets?: NetAssetClass;
  /** Free text — what this line is for, in words a person recognises. */
  memo?: string;
}

export interface JournalEntry {
  id: string;
  /** Civil date, YYYY-MM-DD. String work: a posting date is a date, not an instant. */
  date: string;
  /** One sentence. What happened, not which accounts moved. */
  description: string;
  lines: Line[];
  /** Who made the entry. Never defaulted — an unattributed entry cannot be stood behind. */
  by: string;
  /** When it was recorded, as opposed to the date it is posted to. */
  recordedAt: string;
  /**
   * Where this came from, so an entry can be traced back to evidence.
   * e.g. `plaid:2026-09-30T19-41-50-010Z-0`, `manual`, `adjustment:FY2026-closing`.
   */
  source: string;
}

export const sumDebits = (lines: Line[]): number =>
  lines.reduce((n, l) => n + (l.debitCents ?? 0), 0);
export const sumCredits = (lines: Line[]): number =>
  lines.reduce((n, l) => n + (l.creditCents ?? 0), 0);

/**
 * Check an entry before it is stored. Returns it, or throws with a message a person can act on.
 *
 * ⚠️ THROWS RATHER THAN RETURNING A VALIDITY FLAG. A flag has to be checked, and the one
 * caller that forgets writes an unbalanced entry into the books. There is no partial success
 * here worth representing.
 */
export function checkEntry(e: JournalEntry, chart: Account[]): JournalEntry {
  if (!e.lines.length) throw new PostingRefused('An entry with no lines records nothing.');
  if (!e.by.trim()) throw new PostingRefused('An entry must record who made it.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
    throw new PostingRefused(`Posting date "${e.date}" must be YYYY-MM-DD.`);
  }
  if (!e.description.trim()) {
    throw new PostingRefused(
      'An entry needs a description. "Which accounts moved" is already in the lines; the ' +
      'description is what a person reads a year later to know what happened.',
    );
  }

  for (const [i, l] of e.lines.entries()) {
    const where = `line ${i + 1} (${l.account})`;
    const acct = findAccount(chart, l.account);
    if (!acct) {
      throw new PostingRefused(
        `${where}: no account ${l.account} in this chart. Posting to an unknown account puts ` +
        'money somewhere no statement reports, and the trial balance still balances.',
      );
    }

    const d = l.debitCents ?? 0;
    const c = l.creditCents ?? 0;
    if (d < 0 || c < 0) {
      // ⚠️ A negative debit is a credit wearing a disguise. Allowing it means two ways to
      // express the same posting, and every report has to handle both.
      throw new PostingRefused(
        `${where}: amounts must be positive. To move money the other way, use the other side.`,
      );
    }
    if (!Number.isInteger(d) || !Number.isInteger(c)) {
      throw new PostingRefused(`${where}: amounts are integer CENTS, not dollars.`);
    }
    if ((d === 0) === (c === 0)) {
      throw new PostingRefused(
        `${where}: exactly one of debit or credit must be non-zero (got ${d} / ${c}).`,
      );
    }

    if (requiresFunction(acct.type) && !l.fn) {
      throw new PostingRefused(
        `${where}: "${acct.name}" is an expense, so it needs a function — program, management ` +
        'or fundraising. Form 990 Part IX requires the split, and it cannot be worked out ' +
        'later: whether a grocery bill fed the pantry or a staff meeting is not in the ' +
        'transaction.',
      );
    }
    if (!requiresFunction(acct.type) && l.fn) {
      // Allowing it would put non-expenses in the functional expense matrix.
      throw new PostingRefused(`${where}: "${acct.name}" is not an expense; it takes no function.`);
    }

    if (requiresNetAssetClass(acct.type) && !l.netAssets) {
      throw new PostingRefused(
        `${where}: "${acct.name}" is revenue, so it needs a net asset class — with or without ` +
        'donor restrictions (ASU 2016-14). The restriction lives in the gift letter, not in ' +
        'the bank feed, so it has to be recorded now.',
      );
    }
    if (!requiresNetAssetClass(acct.type) && l.netAssets) {
      throw new PostingRefused(`${where}: "${acct.name}" is not revenue; it takes no net asset class.`);
    }
  }

  const debits = sumDebits(e.lines);
  const credits = sumCredits(e.lines);
  if (debits !== credits) {
    const diff = Math.abs(debits - credits);
    throw new PostingRefused(
      `Entry does not balance: debits ${debits} vs credits ${credits}, out by ${diff} cent` +
      `${diff === 1 ? '' : 's'}. Every entry must balance exactly — a trial balance is the ` +
      'first thing a CPA checks, and one unbalanced entry makes all of it meaningless.',
    );
  }
  if (debits === 0) {
    throw new PostingRefused('An entry of zero records nothing. Delete it rather than posting it.');
  }

  return e;
}

/** Build a checked entry. The only way to make one this library will accept. */
export function entry(
  e: Omit<JournalEntry, 'id'> & { id?: string }, chart: Account[],
): JournalEntry {
  const built: JournalEntry = { id: e.id ?? `${e.recordedAt}#${e.source}`, ...e } as JournalEntry;
  return checkEntry(built, chart);
}

// ── Reading the ledger ───────────────────────────────────────────────────────────────

export interface AccountBalance {
  code: string;
  name: string;
  type: Account['type'];
  debitCents: number;
  creditCents: number;
  /** Signed, in the account's NORMAL direction — positive means a normal balance. */
  balanceCents: number;
}

/**
 * The trial balance: every account, and proof the books balance.
 *
 * ⚠️ `balanced` IS NOT DECORATIVE. It is the first thing a CPA checks and the precondition
 * for every statement below. If it is ever false the reports are arithmetic over nonsense,
 * so callers must branch on it rather than render around it.
 */
export interface TrialBalance {
  accounts: AccountBalance[];
  totalDebitsCents: number;
  totalCreditsCents: number;
  balanced: boolean;
  /** Signed difference. Zero when balanced; useful for finding the entry at fault. */
  differenceCents: number;
  entries: number;
}

export function trialBalance(entries: JournalEntry[], chart: Account[]): TrialBalance {
  const totals = new Map<string, { d: number; c: number }>();
  for (const e of entries) {
    for (const l of e.lines) {
      const t = totals.get(l.account) ?? { d: 0, c: 0 };
      t.d += l.debitCents ?? 0;
      t.c += l.creditCents ?? 0;
      totals.set(l.account, t);
    }
  }

  const accounts: AccountBalance[] = [];
  for (const [code, t] of [...totals].sort((a, b) => a[0].localeCompare(b[0]))) {
    const acct = findAccount(chart, code);
    // An account that vanished from the chart after being posted to is a real problem, and
    // dropping its balance would silently unbalance the trial balance. It is reported.
    const type = acct?.type ?? 'asset';
    const normal = NORMAL_BALANCE[type];
    accounts.push({
      code,
      name: acct?.name ?? `⚠️ ${code} — not in this chart`,
      type,
      debitCents: t.d,
      creditCents: t.c,
      balanceCents: normal === 'debit' ? t.d - t.c : t.c - t.d,
    });
  }

  const totalDebitsCents = accounts.reduce((n, a) => n + a.debitCents, 0);
  const totalCreditsCents = accounts.reduce((n, a) => n + a.creditCents, 0);
  return {
    accounts,
    totalDebitsCents,
    totalCreditsCents,
    balanced: totalDebitsCents === totalCreditsCents,
    differenceCents: totalDebitsCents - totalCreditsCents,
    entries: entries.length,
  };
}

/** Entries posted within a period, inclusive. String comparison — no timezone to get wrong. */
export const inPeriod = (entries: JournalEntry[], start: string, end: string): JournalEntry[] =>
  entries.filter((e) => e.date >= start && e.date <= end);
