/**
 * The financial statements, from the journal.
 *
 * ⚠️ ONE RULE HERE IS COUNTER-INTUITIVE AND IS THE MOST COMMON NONPROFIT ACCOUNTING ERROR:
 * **expenses are ALWAYS a decrease in net assets WITHOUT donor restrictions.** Spending a
 * restricted grant does not reduce the restricted class directly. Two things happen:
 *
 *   1. the restriction is satisfied, so the amount is RELEASED — reclassified from "with" to
 *      "without", netting to zero across the organisation;
 *   2. the expense is then recorded against the unrestricted class, like any other.
 *
 * That is why `Line.netAssets` exists on revenue and not on expenses, and why account 4900
 * (net assets released from restriction) is modelled as revenue carrying BOTH classes — a
 * debit against "with" and a credit against "without" in the same balanced entry.
 *
 * Getting this wrong understates the restricted class and makes releases invisible, which is
 * precisely the drift that leaves restricted net assets growing forever on a balance sheet
 * nobody can explain.
 */
import {
  NORMAL_BALANCE, findAccount, FUNCTION_LABEL, NET_ASSET_LABEL,
  type Account, type FunctionCol, type NetAssetClass,
} from './accounts.ts';
import { trialBalance, type JournalEntry, type TrialBalance } from './journal.ts';

const CLASSES: NetAssetClass[] = ['without', 'with'];
const FUNCTIONS: FunctionCol[] = ['program', 'management', 'fundraising'];

// ── Statement of Activities ──────────────────────────────────────────────────────────

export interface ActivityLine {
  code: string;
  name: string;
  /** Per net asset class, in cents. A release is positive in one and negative in the other. */
  byClass: Record<NetAssetClass, number>;
  totalCents: number;
}

export interface StatementOfActivities {
  periodStart: string;
  periodEnd: string;
  revenue: ActivityLine[];
  revenueTotals: Record<NetAssetClass, number>;
  /** Expenses by natural account. Always unrestricted — see the header. */
  expenses: { code: string; name: string; totalCents: number }[];
  expenseTotal: number;
  /** Change in net assets, per class and in total. */
  changeByClass: Record<NetAssetClass, number>;
  changeTotalCents: number;
  /**
   * ⚠️ FALSE means the underlying ledger does not balance, so every figure above is
   * arithmetic over nonsense. Callers must branch on it rather than render around it.
   */
  trustworthy: boolean;
  trialBalance: TrialBalance;
}

export function statementOfActivities(
  entries: JournalEntry[], chart: Account[], periodStart: string, periodEnd: string,
): StatementOfActivities {
  const inPeriod = entries.filter((e) => e.date >= periodStart && e.date <= periodEnd);
  const tb = trialBalance(inPeriod, chart);

  const rev = new Map<string, Record<NetAssetClass, number>>();
  const exp = new Map<string, number>();

  for (const e of inPeriod) {
    for (const l of e.lines) {
      const a = findAccount(chart, l.account);
      if (!a) continue;
      const d = l.debitCents ?? 0;
      const c = l.creditCents ?? 0;
      if (a.type === 'revenue') {
        const cls = l.netAssets!;                 // guaranteed by checkEntry
        const row = rev.get(l.account) ?? { without: 0, with: 0 };
        // Revenue is a credit balance: credits increase it, debits reduce it. A release
        // debits the "with" class and credits the "without" class in one entry, which falls
        // out of this arithmetic without a special case.
        row[cls] += c - d;
        rev.set(l.account, row);
      } else if (a.type === 'expense') {
        exp.set(l.account, (exp.get(l.account) ?? 0) + d - c);
      }
    }
  }

  const revenue: ActivityLine[] = [...rev]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, byClass]) => ({
      code, name: findAccount(chart, code)?.name ?? code,
      byClass, totalCents: byClass.without + byClass.with,
    }));

  const expenses = [...exp].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, totalCents]) => ({ code, name: findAccount(chart, code)?.name ?? code, totalCents }));

  const revenueTotals = { without: 0, with: 0 } as Record<NetAssetClass, number>;
  for (const r of revenue) for (const c of CLASSES) revenueTotals[c] += r.byClass[c];
  const expenseTotal = expenses.reduce((n, e) => n + e.totalCents, 0);

  // ⚠️ Expenses reduce the UNRESTRICTED class only. See the header.
  const changeByClass: Record<NetAssetClass, number> = {
    without: revenueTotals.without - expenseTotal,
    with: revenueTotals.with,
  };

  return {
    periodStart, periodEnd, revenue, revenueTotals, expenses, expenseTotal,
    changeByClass,
    changeTotalCents: changeByClass.without + changeByClass.with,
    trustworthy: tb.balanced,
    trialBalance: tb,
  };
}

// ── Statement of Functional Expenses ─────────────────────────────────────────────────

export interface FunctionalExpenses {
  /** Natural rows × functional columns. The matrix ASU 2016-14 requires. */
  rows: { code: string; name: string; byFunction: Record<FunctionCol, number>; totalCents: number }[];
  columnTotals: Record<FunctionCol, number>;
  totalCents: number;
  /**
   * Program spend ÷ total spend. ⚠️ NULL when there is no spend — never 0, which would read
   * as "nothing goes to programmes" rather than "nothing was spent".
   */
  programRatio: number | null;
}

export function functionalExpenses(
  entries: JournalEntry[], chart: Account[], periodStart: string, periodEnd: string,
): FunctionalExpenses {
  const grid = new Map<string, Record<FunctionCol, number>>();
  for (const e of entries.filter((x) => x.date >= periodStart && x.date <= periodEnd)) {
    for (const l of e.lines) {
      const a = findAccount(chart, l.account);
      if (a?.type !== 'expense') continue;
      const row = grid.get(l.account) ?? { program: 0, management: 0, fundraising: 0 };
      row[l.fn!] += (l.debitCents ?? 0) - (l.creditCents ?? 0);   // fn guaranteed by checkEntry
      grid.set(l.account, row);
    }
  }

  const rows = [...grid].sort((a, b) => a[0].localeCompare(b[0])).map(([code, byFunction]) => ({
    code, name: findAccount(chart, code)?.name ?? code, byFunction,
    totalCents: FUNCTIONS.reduce((n, f) => n + byFunction[f], 0),
  }));

  const columnTotals = { program: 0, management: 0, fundraising: 0 } as Record<FunctionCol, number>;
  for (const r of rows) for (const f of FUNCTIONS) columnTotals[f] += r.byFunction[f];
  const totalCents = FUNCTIONS.reduce((n, f) => n + columnTotals[f], 0);

  return {
    rows, columnTotals, totalCents,
    programRatio: totalCents === 0 ? null : columnTotals.program / totalCents,
  };
}

// ── Statement of Financial Position ──────────────────────────────────────────────────

export interface FinancialPosition {
  asOf: string;
  assets: { code: string; name: string; cents: number }[];
  liabilities: { code: string; name: string; cents: number }[];
  netAssets: Record<NetAssetClass, number>;
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  totalNetAssetsCents: number;
  /**
   * ⚠️ Assets = Liabilities + Net assets. If this is false the balance sheet does not
   * balance, which is a different and worse failure than a trial balance being out — it means
   * the net asset classes do not reconcile to the accounts.
   */
  balances: boolean;
  trustworthy: boolean;
}

/**
 * Financial position as at a date, from inception through that date.
 *
 * ⚠️ CUMULATIVE, NOT PERIODIC. A balance sheet is a position, not a flow: it is every entry
 * ever posted up to the date, where the statement of activities covers a window. Passing a
 * period here would produce a plausible document describing nothing real.
 */
export function financialPosition(
  entries: JournalEntry[], chart: Account[], asOf: string,
): FinancialPosition {
  const upTo = entries.filter((e) => e.date <= asOf);
  const tb = trialBalance(upTo, chart);

  const pick = (type: Account['type']) => tb.accounts
    .filter((a) => a.type === type)
    .map((a) => ({ code: a.code, name: a.name, cents: a.balanceCents }));

  const assets = pick('asset');
  const liabilities = pick('liability');
  const totalAssetsCents = assets.reduce((n, a) => n + a.cents, 0);
  const totalLiabilitiesCents = liabilities.reduce((n, a) => n + a.cents, 0);

  // Net assets are the accumulated result of every revenue and expense, by class, plus any
  // direct postings to the 3000 range.
  const act = statementOfActivities(upTo, chart, '0000-01-01', asOf);
  const direct = tb.accounts.filter((a) => a.type === 'net-assets')
    .reduce((n, a) => n + a.balanceCents, 0);

  const netAssets: Record<NetAssetClass, number> = {
    // Direct postings to the 3000 range are opening balances; they sit in the unrestricted
    // class unless an organisation posts them otherwise, which is a decision it must make.
    without: act.changeByClass.without + direct,
    with: act.changeByClass.with,
  };
  const totalNetAssetsCents = netAssets.without + netAssets.with;

  return {
    asOf, assets, liabilities, netAssets,
    totalAssetsCents, totalLiabilitiesCents, totalNetAssetsCents,
    balances: totalAssetsCents === totalLiabilitiesCents + totalNetAssetsCents,
    trustworthy: tb.balanced,
  };
}

export { FUNCTION_LABEL, NET_ASSET_LABEL, NORMAL_BALANCE };
