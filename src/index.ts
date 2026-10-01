/**
 * nonprofit-books — double-entry bookkeeping for US nonprofits.
 *
 * Three things this library enforces that a general ledger does not:
 *   · debits equal credits, in integer cents
 *   · every expense line carries a FUNCTION (Form 990 Part IX)
 *   · every revenue line carries a NET ASSET CLASS (FASB ASU 2016-14)
 *
 * The last two cannot be reconstructed from a bank feed, which is why they are refused at
 * posting time rather than validated at reporting time. See README.md.
 */
export {
  CHART, NORMAL_BALANCE, FUNCTION_LABEL, NET_ASSET_LABEL,
  account, accountsOfType, findAccount, cashAccount, extendChart,
  requiresFunction, requiresNetAssetClass, ChartError,
  type Account, type AccountType, type FunctionCol, type NetAssetClass,
} from './accounts.ts';

export {
  entry, checkEntry, trialBalance, inPeriod, sumDebits, sumCredits, PostingRefused,
  type Line, type JournalEntry, type TrialBalance, type AccountBalance,
} from './journal.ts';

export {
  statementOfActivities, functionalExpenses, financialPosition,
  type StatementOfActivities, type FunctionalExpenses, type FinancialPosition,
  type ActivityLine,
} from './statements.ts';

export {
  journalCsv, trialBalanceCsv, chartCsv, exportBundle, dollars, csvField,
  type ExportBundle,
} from './export.ts';
