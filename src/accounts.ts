/**
 * The chart of accounts.
 *
 * ⚠️ NONPROFIT-SHAPED, NOT A BUSINESS CHART WITH DIFFERENT LABELS. Two things are structural
 * rather than cosmetic, and both are explained in BOOKKEEPING.md:
 *
 *   · **Net assets replace equity**, and split into WITHOUT and WITH donor restrictions.
 *     There is no owner's equity and no retained earnings, because nobody owns this.
 *   · **Every expense is allocated across three functions** — program, management & general,
 *     fundraising. The function is a DIMENSION on the posting, not a separate account, which
 *     is what makes the Form 990 Part IX matrix (natural rows × functional columns) possible
 *     from one ledger rather than three.
 *
 * Numbering follows the common nonprofit convention and is close to the published Unified
 * Chart of Accounts (UCOA), which exists to map onto Form 990. ⚠️ It is NOT a verbatim UCOA —
 * that should be confirmed against the current published version before anything is filed.
 */

export type AccountType = 'asset' | 'liability' | 'net-assets' | 'revenue' | 'expense';

/**
 * Which side increases the account.
 *
 * ⚠️ The single most common bookkeeping error is getting this backwards on revenue, because
 * "income goes up" feels like a debit. Revenue is a CREDIT balance. Encoding it here, once,
 * means no posting routine has to remember.
 */
export const NORMAL_BALANCE: Record<AccountType, 'debit' | 'credit'> = {
  asset: 'debit',
  expense: 'debit',
  liability: 'credit',
  'net-assets': 'credit',
  revenue: 'credit',
};

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  /** What it is for, in words, so somebody classifying can tell two similar accounts apart. */
  note?: string;
  /**
   * Revenue only. Whether gifts to this account arrive restricted by default.
   * ⚠️ A DEFAULT, NEVER A CONCLUSION — the donor decides, per gift, and the person recording
   * it says so. See `requiresNetAssetClass`.
   */
  usuallyRestricted?: boolean;
}

/**
 * The DEFAULT chart. An organisation extends it — `cashAccount()` adds one line per real bank
 * account, and `extendChart()` merges organisation-specific accounts in.
 *
 * ⚠️ ONE CASH ACCOUNT PER REAL BANK ACCOUNT, NEVER A COMBINED "CASH". Each statement
 * reconciles to its own account; a combined balance cannot be checked against anything a bank
 * issues, which quietly removes the only completeness check the books have.
 */
export const CHART: Account[] = [
  // ── 1000 Assets ────────────────────────────────────────────────────────────
  // Cash accounts are added per organisation — see `cashAccount`.
  { code: '1100', name: 'Accounts receivable — Medicaid Home Help', type: 'asset',
    note: 'Visits delivered and billed, not yet paid. The asset that makes unbilled and denied work visible — on a cash basis it does not exist, which is exactly where the money is.' },
  { code: '1150', name: 'Grants receivable', type: 'asset',
    note: 'Awarded and unconditional, not yet received. Conditional awards are NOT a receivable.' },
  { code: '1200', name: 'Prepaid expenses', type: 'asset', note: 'Insurance premiums, deposits.' },
  { code: '1500', name: 'Property and equipment', type: 'asset' },
  { code: '1550', name: 'Accumulated depreciation', type: 'asset',
    note: 'Contra-asset: a CREDIT balance sitting in the asset range.' },

  // ── 2000 Liabilities ───────────────────────────────────────────────────────
  { code: '2010', name: 'Accounts payable', type: 'liability' },
  { code: '2100', name: 'Accrued payroll', type: 'liability' },
  { code: '2150', name: 'Payroll taxes payable', type: 'liability' },
  { code: '2300', name: 'Deferred revenue — conditional contributions', type: 'liability',
    note: '⚠️ CONDITIONAL is not the same as RESTRICTED, and conflating them is a common restatement. ASU 2018-08: a contribution is CONDITIONAL only when BOTH a barrier exists (a measurable performance requirement — a match, an outcome, a number served) AND the funder has a right of return or release. Only then is it a liability. A grant that is merely RESTRICTED as to purpose, with no barrier, is revenue WITH donor restrictions (4100/4110) on receipt — not deferred. Getting this backwards overstates one year and understates the next, and a funder comparing two years will ask.' },

  // ── 3000 Net assets ────────────────────────────────────────────────────────
  { code: '3010', name: 'Net assets without donor restrictions', type: 'net-assets' },
  { code: '3020', name: 'Net assets with donor restrictions', type: 'net-assets' },
  { code: '3030', name: 'Board-designated (within net assets WITHOUT restrictions)', type: 'net-assets',
    note: '⚠️ Board-designated is NOT donor-restricted — only a DONOR can restrict a gift. The board can un-designate it tomorrow, so it belongs to the unrestricted class. Treating it as restricted understates what the organisation can actually spend, which is the figure a funder reads when asking whether you can cover a match. ASU 2016-14 requires board-designated amounts to be DISCLOSED, either on the face of the statements or in the notes — so this is a tracked subtotal, not an invisible one.' },

  // ── 4000 Revenue ───────────────────────────────────────────────────────────
  { code: '4010', name: 'Contributions — individual', type: 'revenue' },
  { code: '4020', name: 'Contributions — corporate and church', type: 'revenue' },
  { code: '4100', name: 'Grants — foundation', type: 'revenue', usuallyRestricted: true },
  { code: '4110', name: 'Grants — government', type: 'revenue', usuallyRestricted: true },
  { code: '4200', name: 'Program service revenue — Medicaid Home Help', type: 'revenue',
    note: 'Earned, not contributed. Form 990 Part VIII line 2.' },
  { code: '4210', name: 'Program service revenue — adult foster care', type: 'revenue' },
  { code: '4300', name: 'Contributed nonfinancial assets (in-kind)', type: 'revenue',
    note: 'ASU 2020-07 (periods beginning after 15 Jun 2021): present as a SEPARATE LINE ITEM in the statement of activities, DISAGGREGATED by category of asset, and disclose the valuation technique and inputs per ASC 820 for each category. Donated services have their own recognition test and are not automatically revenue.' },
  { code: '4400', name: 'Investment and interest income', type: 'revenue' },
  { code: '4900', name: 'Net assets released from restriction', type: 'revenue',
    note: '⚠️ Not new money. A reclassification between the two net asset classes as a restricted purpose is satisfied. Without it, restricted net assets grow forever and the balance sheet stops meaning anything.' },

  // ── 5000 Expenses — NATURAL categories, allocated across the three functions ─
  { code: '5010', name: 'Salaries and wages', type: 'expense' },
  { code: '5020', name: 'Payroll taxes and benefits', type: 'expense' },
  { code: '5030', name: 'Contract labour — caregivers', type: 'expense',
    note: '⚠️ Worker classification (1099 vs W-2) is heavily scrutinised in home care. Worth an employment attorney before the first hire, not after the tenth.' },
  { code: '5100', name: 'Occupancy — rent, utilities, maintenance', type: 'expense' },
  { code: '5200', name: 'Insurance', type: 'expense',
    note: 'A paid premium means a certificate of insurance is obtainable — which many funders require as a threshold item.' },
  { code: '5300', name: 'Professional fees — accounting and legal', type: 'expense' },
  { code: '5400', name: 'Supplies and food', type: 'expense' },
  { code: '5500', name: 'Transportation and vehicle', type: 'expense' },
  { code: '5600', name: 'Client assistance — housing, transport, direct aid', type: 'expense' },
  { code: '5700', name: 'Technology and software', type: 'expense' },
  { code: '5800', name: 'Training and certification', type: 'expense' },
  { code: '5900', name: 'Bank and processing fees', type: 'expense' },
  { code: '5950', name: 'Depreciation', type: 'expense' },
];

const BY_CODE = new Map(CHART.map((a) => [a.code, a]));
/** Look up in the DEFAULT chart. For an extended chart use `findAccount`. */
export const account = (code: string): Account | undefined => BY_CODE.get(code);
export const accountsOfType = (t: AccountType, chart: Account[] = CHART): Account[] =>
  chart.filter((a) => a.type === t);

/**
 * ⚠️ AN EXPENSE POSTING MUST CARRY A FUNCTION, AND A REVENUE POSTING MUST CARRY A NET ASSET
 * CLASS. These two rules are the entire difference between this and a business ledger, and
 * neither can be reconstructed afterwards from a bank feed — the function lives in what the
 * money was FOR, and the restriction lives in the gift letter. Both have to be captured when
 * a person records the transaction or they are gone.
 */
export const requiresFunction = (type: AccountType): boolean => type === 'expense';
export const requiresNetAssetClass = (type: AccountType): boolean => type === 'revenue';

/** Form 990 Part IX columns. */
export type FunctionCol = 'program' | 'management' | 'fundraising';
export const FUNCTION_LABEL: Record<FunctionCol, string> = {
  program: 'Program services',
  management: 'Management & general',
  fundraising: 'Fundraising',
};

/** FASB ASU 2016-14 classes. Two, not the pre-2018 three. */
export type NetAssetClass = 'without' | 'with';
export const NET_ASSET_LABEL: Record<NetAssetClass, string> = {
  without: 'Without donor restrictions',
  with: 'With donor restrictions',
};


// ── Extending the chart for one organisation ─────────────────────────────────────────

/**
 * A cash account for one real bank account.
 *
 * ⚠️ `code` must be unique and in the 1000 range, and there must be exactly one per bank
 * account the organisation holds. Two accounts sharing a code, or one account standing for
 * two banks, both break reconciliation — and reconciliation is the only thing that proves
 * the books are complete rather than merely self-consistent.
 */
export function cashAccount(code: string, name: string, note?: string): Account {
  if (!/^1\d{3}$/.test(code)) {
    throw new Error(`Cash account code ${code} must be four digits in the 1000 (asset) range.`);
  }
  return { code, name, type: 'asset', note };
}

export class ChartError extends Error {}

/**
 * Merge organisation-specific accounts into the default chart.
 *
 * ⚠️ IT REFUSES A DUPLICATE CODE RATHER THAN LETTING THE LATER ONE WIN. Silently overriding
 * `4200` would move every Medicaid posting ever made into a different account, and nothing
 * about the ledger would look wrong — the trial balance would still balance, because it
 * balances on debits and credits rather than on meaning.
 */
export function extendChart(extra: Account[], base: Account[] = CHART): Account[] {
  const seen = new Map(base.map((a) => [a.code, a]));
  for (const a of extra) {
    const clash = seen.get(a.code);
    if (clash) {
      throw new ChartError(
        `Account code ${a.code} is already "${clash.name}" — refusing to redefine it as ` +
        `"${a.name}". Pick an unused code; silently overriding one moves every posting ever ` +
        'made against it, and the trial balance would still balance.',
      );
    }
    if (!/^\d{4}$/.test(a.code)) throw new ChartError(`Account code ${a.code} must be four digits.`);
    seen.set(a.code, a);
  }
  return [...seen.values()].sort((x, y) => x.code.localeCompare(y.code));
}

/** Look a code up in a specific chart. */
export const findAccount = (chart: Account[], code: string): Account | undefined =>
  chart.find((a) => a.code === code);
