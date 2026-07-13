import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  api,
  type Account,
  type BookTransaction,
  type JournalCreatePayload,
  type JournalEntry,
  type Voucher,
} from "../lib/api";
import { useAuth } from "./AuthContext";

interface DataContextValue {
  accounts: Account[];
  journalEntries: JournalEntry[];
  vouchers: Voucher[];
  cashTransactions: BookTransaction[];
  bankTransactions: BookTransaction[];
  loading: boolean;
  refresh: () => Promise<void>;
  createJournal: (payload: JournalCreatePayload) => Promise<void>;
  createVoucher: (payload: Omit<Voucher, "id">) => Promise<void>;
  approveVoucher: (id: string) => Promise<void>;
  createAccount: (payload: Omit<Account, "id">) => Promise<void>;
  updateAccount: (
    id: string,
    payload: Partial<Omit<Account, "id" | "backendId" | "balance">>,
  ) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const isCashAccount = (account: Account | undefined) =>
  Boolean(
    account &&
    account.type === "Asset" &&
    account.name.toLowerCase().includes("cash"),
  );

const isBankAccount = (account: Account | undefined) =>
  Boolean(
    account &&
    account.type === "Asset" &&
    account.group.toLowerCase() === "bank",
  );

const naturalBalance = (account: Account, journals: JournalEntry[]) => {
  const totals = journals
    .filter((journal) => journal.status === "Posted")
    .flatMap((journal) => journal.entries)
    .filter((line) => line.account === account.name)
    .reduce(
      (sum, line) => ({
        debit: sum.debit + (Number(line.debit ?? line.dr) || 0),
        credit: sum.credit + (Number(line.credit ?? line.cr) || 0),
      }),
      { debit: 0, credit: 0 },
    );
  const opening = Number(account.opening_balance) || 0;
  return ["Asset", "Expense"].includes(account.type)
    ? opening + totals.debit - totals.credit
    : opening + totals.credit - totals.debit;
};

const buildBookRows = (
  accounts: Account[],
  journals: JournalEntry[],
  book: "cash" | "bank",
): BookTransaction[] => {
  const rows: BookTransaction[] = [];
  let balance = accounts
    .filter((account) =>
      book === "cash" ? isCashAccount(account) : isBankAccount(account),
    )
    .reduce((sum, account) => sum + (Number(account.opening_balance) || 0), 0);
  journals
    .filter((journal) => journal.status === "Posted")
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((journal) => {
      journal.entries.forEach((line, index) => {
        const account = accounts.find((row) => row.name === line.account);
        const belongs =
          book === "cash" ? isCashAccount(account) : isBankAccount(account);
        if (!belongs) return;
        const debit = Number(line.debit ?? line.dr) || 0;
        const credit = Number(line.credit ?? line.cr) || 0;
        balance += debit - credit;
        rows.push({
          id: `${journal.id}-${index}`,
          book,
          date: journal.date,
          particulars: journal.narration,
          voucher_no: journal.voucher_no,
          voucherNo: journal.voucher_no,
          type: debit > 0 ? "Receipt" : "Payment",
          debit,
          credit,
          dr: debit,
          cr: credit,
          balance,
        });
      });
    });
  return rows;
};

const recalculateBookRows = (rows: BookTransaction[], opening: number) => {
  let balance = opening;
  return rows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      balance += row.debit - row.credit;
      return { ...row, balance };
    });
};

export function DataProvider({ children, activePage }: { children: React.ReactNode; activePage: string }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [cashTransactions, setCashTransactions] = useState<BookTransaction[]>(
    [],
  );
  const [bankTransactions, setBankTransactions] = useState<BookTransaction[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const refreshingRef = useRef(false);
  const accountsCacheRef = useRef<Account[]>([]);

  const refresh = useCallback(async () => {
    if (!user || refreshingRef.current) return;
    refreshingRef.current = true;
    setLoading(true);
    try {
      const needsAccounts = !["dashboard", "daybook", "reports", "settings", "notifications", "user-management", "clean-db"].includes(activePage);
      const needsJournals = ["cashbook", "bankbook", "profit-analysis", "cash-flow-report"].includes(activePage);
      const needsCash = ["cashbook", "cash-flow-report"].includes(activePage);
      const needsBank = ["bankbook", "cash-flow-report"].includes(activePage);
      const [accountRows, journalRows, voucherRows, cashRows, bankRows] =
        await Promise.all([
          needsAccounts && accountsCacheRef.current.length === 0 ? api.accounts() : Promise.resolve(accountsCacheRef.current),
          needsJournals ? api.journals() : Promise.resolve([]),
          Promise.resolve([]),
          needsCash ? api.transactions("cash") : Promise.resolve([]),
          needsBank ? api.transactions("bank") : Promise.resolve([]),
        ]);
      const normalizedJournals = journalRows.map((row) => ({
        ...row,
        voucherNo: row.voucher_no,
        entries: row.entries.map((line) => ({
          ...line,
          dr: line.debit,
          cr: line.credit,
        })),
      }));
      const normalizedAccounts = accountRows.map((row) => ({
        ...row,
        backendId: row.id,
        id: row.code,
      }));
      const accountsWithBalances = normalizedAccounts.map((account) => ({
        ...account,
        balance:
          typeof account.balance === "number"
            ? account.balance
            : naturalBalance(account, normalizedJournals),
      }));
      if (needsAccounts) {
        accountsCacheRef.current = accountsWithBalances;
        setAccounts(accountsWithBalances);
      }
      setJournalEntries(normalizedJournals);
      setVouchers(
        voucherRows.map((row) => ({
          ...row,
          backendId: row.id,
          id: row.voucher_no,
          voucherNo: row.voucher_no,
        })),
      );
      const manualCashRows = cashRows.map((row) => ({
        ...row,
        voucherNo: row.voucher_no,
        dr: row.debit,
        cr: row.credit,
      }));
      const manualBankRows = bankRows.map((row) => ({
        ...row,
        voucherNo: row.voucher_no,
        dr: row.debit,
        cr: row.credit,
      }));
      const cashOpening = accountsWithBalances
        .filter(isCashAccount)
        .reduce(
          (sum, account) => sum + (Number(account.opening_balance) || 0),
          0,
        );
      const bankOpening = accountsWithBalances
        .filter(isBankAccount)
        .reduce(
          (sum, account) => sum + (Number(account.opening_balance) || 0),
          0,
        );
      const journalCashRows = buildBookRows(
        accountsWithBalances,
        normalizedJournals,
        "cash",
      );
      const journalBankRows = buildBookRows(
        accountsWithBalances,
        normalizedJournals,
        "bank",
      );
      setCashTransactions(
        recalculateBookRows(
          [...journalCashRows, ...manualCashRows],
          cashOpening,
        ),
      );
      setBankTransactions(
        recalculateBookRows(
          [...journalBankRows, ...manualBankRows],
          bankOpening,
        ),
      );
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }, [activePage, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(
      () => {
        accountsCacheRef.current = [];
        void refresh();
      },
      10 * 60 * 1000,
    );
    return () => window.clearInterval(interval);
  }, [refresh, user]);

  const value = useMemo<DataContextValue>(
    () => ({
      accounts,
      journalEntries,
      vouchers,
      cashTransactions,
      bankTransactions,
      loading,
      refresh,
      createJournal: async (payload) => {
        await api.createJournal(payload);
        accountsCacheRef.current = [];
        await refresh();
      },
      createVoucher: async (payload) => {
        await api.createVoucher(payload);
        accountsCacheRef.current = [];
        await refresh();
      },
      approveVoucher: async (id) => {
        await api.approveVoucher(id);
        accountsCacheRef.current = [];
        await refresh();
      },
      createAccount: async (payload) => {
        await api.createAccount(payload);
        accountsCacheRef.current = [];
        await refresh();
      },
      updateAccount: async (id, payload) => {
        await api.updateAccount(id, payload);
        accountsCacheRef.current = [];
        await refresh();
      },
      deleteAccount: async (id) => {
        await api.deleteAccount(id);
        accountsCacheRef.current = [];
        await refresh();
      },
    }),
    [
      accounts,
      bankTransactions,
      cashTransactions,
      journalEntries,
      loading,
      refresh,
      vouchers,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useLedgerData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("useLedgerData must be used within DataProvider");
  return value;
}
