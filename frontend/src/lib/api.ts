// Prefer a same-origin API path so HTTP-only authentication cookies continue
// working when hosts, ports, or Vite modes change. An absolute URL remains an
// explicit deployment option for installations configured for cross-site auth.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || "/api";

export type UserRole = "superadmin" | "admin" | "user";
export interface PageContentResponse { pages: Record<string, { title: string; description: string }>; footer: string }
export interface PageResponse<T> { items: T[]; page: number; page_size: number; total: number; pages: number }
export interface PageQuery { page?: number; page_size?: number; search?: string; sort_by?: string; sort_order?: "asc" | "desc"; [key: string]: string | number | boolean | undefined }

const queryString = (params: PageQuery) => {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") query.set(key, String(value)) })
  return query.toString()
}

export interface AuthUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: UserRole;
  is_active?: boolean;
  created_at?: string;
}

export interface Account {
  id: string;
  backendId?: string;
  code: string;
  name: string;
  type: "Asset" | "Liability" | "Equity" | "Income" | "Expense";
  group: string;
  opening_balance: number;
  balance?: number;
  is_active: boolean;
}

export interface JournalLine {
  account: string;
  debit: number;
  credit: number;
  dr: number;
  cr: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  voucher_no: string;
  voucherNo: string;
  narration: string;
  entries: JournalLine[];
  status: "Draft" | "Posted";
}

export interface Voucher {
  id: string;
  backendId?: string;
  voucher_no: string;
  voucherNo?: string;
  date: string;
  type: "Payment" | "Receipt" | "Contra" | "Sales" | "Purchase" | "Journal";
  party: string;
  amount: number;
  mode: string;
  status: "Pending" | "Approved" | "Rejected";
  narration: string;
}

export interface BookTransaction {
  id: string;
  book: "cash" | "bank";
  date: string;
  particulars: string;
  voucher_no: string;
  voucherNo: string;
  type: "Receipt" | "Payment";
  debit: number;
  credit: number;
  dr: number;
  cr: number;
  balance: number;
}

export interface LedgerRow {
  date: string;
  particulars: string;
  voucher_no: string;
  voucherNo: string;
  type: "Receipt" | "Payment";
  debit: number;
  credit: number;
  dr: number;
  cr: number;
  balance: number;
}

export interface JournalCreatePayload {
  date: string;
  voucher_no: string;
  narration: string;
  status: "Draft" | "Posted";
  entries: Array<{
    account: string;
    debit: number;
    credit: number;
  }>;
}

export type VoucherWritePayload = Pick<
  Voucher,
  "voucher_no" | "date" | "type" | "party" | "amount" | "mode" | "narration"
>;

export interface Notification {
  id: string;
  title: string;
  message: string;
  audience: string;
  created_at: string;
}

export interface AdminCollection {
  name: string;
  default_selected: boolean;
  protected_default?: boolean;
}

export interface CompanySettings {
  company_name: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  business_type: string;
  registered_address: string;
}

export interface FiscalSettings {
  start: string;
  end: string;
  financial_year: string;
  currency: string;
  date_format: string;
  voucher_numbering: string;
}

export type NotificationSettings = Record<
  | "pending_vouchers"
  | "daily_digest"
  | "low_balance"
  | "gst_reminders"
  | "journal_posted",
  boolean
>;
export interface AppSettings {
  company: CompanySettings;
  fiscal: FiscalSettings;
  notifications: NotificationSettings;
}
export interface DatabaseExport {
  exported_at: string;
  data: Record<string, Record<string, unknown>[]>;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || "GET";
  if (import.meta.env.DEV) {
    console.info(`[API] ${method} ${path}`);
  }
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (import.meta.env.DEV) {
    console.info(`[API] ${method} ${path} -> ${response.status}`);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(formatApiError(body?.detail), response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

function formatApiError(detail: unknown) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item)
          return String(item.msg);
        return "Validation error";
      })
      .join(", ");
  }
  return "Request failed";
}

export const api = {
  loginContent: () => request<PageContentResponse>("/content/login"),
  content: () => request<PageContentResponse>("/content"),
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request<AuthUser>("/auth/me"),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  forgotPassword: (email: string) =>
    request<{
      message: string;
      otp?: string;
      html?: string;
      cooldown_seconds?: number;
    }>("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (email: string, otp: string, new_password: string) =>
    request<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ email, otp, new_password }),
    }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),
  updateProfile: (payload: {
    first_name: string;
    last_name: string;
    email: string;
  }) =>
    request<AuthUser>("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  users: () => request<AuthUser[]>("/auth/users"),
  createUser: (payload: {
    first_name: string;
    last_name: string;
    email: string;
    password: string;
    role: UserRole;
  }) =>
    request<AuthUser>("/auth/users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  setUserStatus: (id: string, is_active: boolean) =>
    request<AuthUser>(`/auth/users/${id}/status?is_active=${is_active}`, {
      method: "PATCH",
    }),
  deleteUser: (id: string) =>
    request<void>(`/auth/users/${id}`, { method: "DELETE" }),
  accounts: () => request<Account[]>("/accounts"),
  accountsPage: (params: PageQuery) => request<PageResponse<Account>>(`/accounts/page?${queryString(params)}`),
  accountStats: () => request<{ total: number; by_type: Record<string, number>; groups: string[] }>("/accounts/stats"),
  createAccount: (payload: Omit<Account, "id">) =>
    request<Account>("/accounts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateAccount: (id: string, payload: Partial<Omit<Account, "id" | "backendId" | "balance">>) =>
    request<Account>(`/accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteAccount: (id: string) =>
    request<void>(`/accounts/${id}`, { method: "DELETE" }),
  journals: () => request<JournalEntry[]>("/journal-entries"),
  journalsPage: (params: PageQuery) => request<PageResponse<JournalEntry>>(`/journal-entries/page?${queryString(params)}`),
  createJournal: (payload: JournalCreatePayload) =>
    request<JournalEntry>("/journal-entries", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateJournal: (id: string, payload: JournalCreatePayload) =>
    request<JournalEntry>(`/journal-entries/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteJournal: (id: string) =>
    request<void>(`/journal-entries/${id}`, { method: "DELETE" }),
  vouchers: () => request<Voucher[]>("/vouchers"),
  vouchersPage: (params: PageQuery) => request<PageResponse<Voucher>>(`/vouchers/page?${queryString(params)}`),
  voucherStats: () => request<{ total: number; by_type: Record<string, number> }>("/vouchers/stats"),
  createVoucher: (payload: Omit<Voucher, "id">) =>
    request<Voucher>("/vouchers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateVoucher: (id: string, payload: VoucherWritePayload) =>
    request<Voucher>(`/vouchers/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteVoucher: (id: string) =>
    request<void>(`/vouchers/${id}`, { method: "DELETE" }),
  approveVoucher: (id: string) =>
    request<Voucher>(`/vouchers/${id}/approve`, { method: "PATCH" }),
  transactions: (book?: "cash" | "bank") =>
    request<BookTransaction[]>(`/transactions${book ? `?book=${book}` : ""}`),
  transactionsPage: (params: PageQuery) => request<PageResponse<BookTransaction>>(`/transactions/page?${queryString(params)}`),
  ledger: (accountName: string) =>
    request<LedgerRow[]>(`/reports/ledger/${encodeURIComponent(accountName)}`),
  ledgerAccounts: () => request<{ accounts: string[] }>("/reports/ledger-accounts"),
  ledgerPage: (accountName: string, params: PageQuery) => request<PageResponse<LedgerRow>>(`/reports/ledger/${encodeURIComponent(accountName)}/page?${queryString(params)}`),
  dashboard: () => request<{
    stats: { cash: number; bank: number; sales: number; purchases: number; profit: number; pending_vouchers: number };
    recent_journals: JournalEntry[];
    monthly: { key: string; revenue: number; expenses: number; inflow: number; outflow: number; profit: number }[];
    expense_breakdown: { name: string; value: number }[];
  }>("/reports/dashboard"),
  notifications: () => request<Notification[]>("/notifications"),
  createNotification: (payload: {
    title: string;
    message: string;
    audience: string;
  }) =>
    request<Notification>("/notifications", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  adminCollections: () => request<AdminCollection[]>("/admin/collections"),
  cleanCollections: (collections: string[]) =>
    request<{ deleted: Record<string, number> }>("/admin/clean", {
      method: "POST",
      body: JSON.stringify({ collections }),
    }),
  settings: () => request<AppSettings>("/settings"),
  updateCompanySettings: (payload: CompanySettings) =>
    request<CompanySettings>("/settings/company", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateFiscalSettings: (payload: FiscalSettings) =>
    request<FiscalSettings>("/settings/fiscal", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  updateNotificationSettings: (payload: NotificationSettings) =>
    request<NotificationSettings>("/settings/notifications", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  exportDatabase: () => request<DatabaseExport>("/settings/export"),
};
