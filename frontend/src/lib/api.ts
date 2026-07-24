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
  audit_mode?: boolean;
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
  document_count: number;
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

export interface ClosingPreviewEntry {
  system_entry_type: "PROFIT_TRANSFER" | "DRAWINGS_TRANSFER" | "RETIREMENT_PROFIT_TRANSFER" | "RETIREMENT_DRAWINGS_TRANSFER" | "RETIREMENT_CAPITAL_TO_LOAN";
  voucher_no: string;
  date: string;
  narration: string;
  entries: Array<{ account: string; debit: number; credit: number }>;
}
export interface PartnerCapitalSettings {
  partner_name: string;
  account_name: string;
  account_code: string;
  share_percentage: number;
  opening_balance: number;
  admission_date: string | null;
  retirement_date: string | null;
  retirement_share_percentage?: number | null;
}
export interface RetirementSettlementRequest {
  partner_name: string;
  account_name: string;
  account_code: string;
  share_percentage: number;
  admission_date: string;
  retirement_date: string;
  profit_partners: Array<{ account_name: string; share_percentage: number }>;
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
  partners: PartnerCapitalSettings[];
}
export interface ReportPeriod { start_date: string; end_date: string }
export interface FinancialReportRow { code: string; name: string; type?: Account['type']; group: string; amount: number; calculated?: boolean }
export interface TrialBalanceRow extends FinancialReportRow {
  type: Account['type']; opening_balance: number; period_movement: number; closing_balance: number; debit: number; credit: number
}
export interface FinancialStatementResponse {
  period: ReportPeriod
  trial_balance: { rows: TrialBalanceRow[]; total_debit: number; total_credit: number }
  profit_and_loss: {
    opening_stock: number; closing_stock: number; direct_expenses: FinancialReportRow[]; direct_income: FinancialReportRow[]
    indirect_expenses: FinancialReportRow[]; indirect_income: FinancialReportRow[]; gross_profit: number; net_profit: number
  }
  balance_sheet: { assets: FinancialReportRow[]; liabilities_and_capital: FinancialReportRow[]; closing_stock: number; opening_retained_earnings: number }
}
export interface DatabaseExport {
  exported_at: string;
  data: Record<string, Record<string, unknown>[]>;
}

export type AIProvider = "grok" | "groq" | "gemini";
export interface AIProviderConfiguration {
  provider: AIProvider;
  model: string;
  expires_at: string;
}
export interface AIKeyStatus {
  configured: boolean;
  active_provider: AIProvider | null;
  active_model: string | null;
  configurations: AIProviderConfiguration[];
}

export interface AIChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIChatResponse {
  in_scope: boolean;
  answer: string;
  suggestions: string[];
  provider: AIProvider;
  model: string;
}

export type AIChatStreamEvent =
  | { type: "start"; provider: AIProvider; model: string }
  | { type: "delta"; delta: string }
  | { type: "done"; response: AIChatResponse }
  | { type: "error"; provider: AIProvider; code: string; message: string; retryable: boolean };

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
    headers: options.body instanceof FormData
      ? options.headers
      : { "Content-Type": "application/json", ...options.headers },
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
    audit_mode?: boolean;
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
  financialReportJournals: () => request<JournalEntry[]>("/reports/journal-data"),
  financialYears: () => request<{ periods: ReportPeriod[] }>("/reports/financial-years"),
  financialStatements: (startDate: string, endDate: string, businessStartDate?: string) => {
    const query = new URLSearchParams({ start_date: startDate, end_date: endDate })
    if (businessStartDate) query.set('business_start_date', businessStartDate)
    return request<FinancialStatementResponse>(`/reports/financial-statements?${query}`)
  },
  journalsPage: (params: PageQuery) => request<PageResponse<JournalEntry>>(`/journal-entries/page?${queryString(params)}`),
  createJournal: (payload: JournalCreatePayload) =>
    request<JournalEntry>("/journal-entries", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  closingPreview: (closingDate: string) =>
    request<{ entries: ClosingPreviewEntry[] }>(`/journal-entries/closing-preview?closing_date=${encodeURIComponent(closingDate)}`),
  pendingClosingPreview: () =>
    request<{ closing_date: string | null; entries: ClosingPreviewEntry[] }>("/journal-entries/pending-closing-preview"),
  confirmClosingEntries: (closingDate: string, entries: Array<Pick<ClosingPreviewEntry, "system_entry_type" | "voucher_no" | "narration">>) =>
    request<{ created: number; entries: ClosingPreviewEntry[] }>("/journal-entries/closing-confirm", {
      method: "POST",
      body: JSON.stringify({ closing_date: closingDate, entries }),
    }),
  importJournalsExcel: (file: File, accountDefinitions?: Array<{ source_name: string; name: string; code: string; type: Account['type']; group: string }>) => {
    const body = new FormData()
    body.append('file', file)
    if (accountDefinitions?.length) body.append('account_definitions', JSON.stringify(accountDefinitions))
    return request<{ imported: number; voucher_numbers: string[]; line_count: number }>("/journal-entries/import-excel", { method: "POST", body })
  },
  previewJournalsExcel: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<{ unknown_ledgers: Array<{ source_name: string; name: string; code: string; type: Account['type']; group: string }> }>("/journal-entries/import-excel/preview", { method: "POST", body })
  },
  downloadJournalImportSample: async () => {
    const response = await fetch(`${API_BASE_URL}/journal-entries/import-excel/sample`, { credentials: "include" })
    if (!response.ok) throw new ApiError("Unable to download the journal import sample", response.status)
    return response.blob()
  },
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
  ledgerPage: (accountName: string, params: PageQuery) => request<PageResponse<LedgerRow>>(`/reports/ledger-page?${queryString({ ...params, account_name: accountName })}`),
  dashboard: (graphStartDate?: string, graphEndDate?: string) => {
    const query = new URLSearchParams()
    if (graphStartDate) query.set('graph_start_date', graphStartDate)
    if (graphEndDate) query.set('graph_end_date', graphEndDate)
    return request<{
    stats: { cash: number; bank: number; sales: number; purchases: number; profit: number; pending_vouchers: number };
    recent_journals: JournalEntry[];
    monthly: { key: string; revenue: number; expenses: number; inflow: number; outflow: number; profit: number }[];
    expense_breakdown: { name: string; value: number }[];
    }>(`/reports/dashboard${query.size ? `?${query}` : ''}`)
  },
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
  cleanCollections: (collections: string[], password: string) =>
    request<{ deleted: Record<string, number> }>("/admin/clean", {
      method: "POST",
      body: JSON.stringify({ collections, password }),
    }),
  createDefaultAccounts: () =>
    request<{ created: number; existing: number; total: number }>("/admin/default-accounts", {
      method: "POST",
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
  updatePartnerSettings: (partners: PartnerCapitalSettings[]) =>
    request<{ partners: PartnerCapitalSettings[] }>("/settings/partners", {
      method: "PATCH",
      body: JSON.stringify({ partners }),
    }),
  retirementSettlementPreview: (payload: RetirementSettlementRequest) =>
    request<{ entries: ClosingPreviewEntry[] }>("/settings/partners/retirement-preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  confirmRetirementSettlement: (payload: RetirementSettlementRequest) =>
    request<{ created: number; entries: ClosingPreviewEntry[]; loan_account: { name: string; code: string; type: 'Liability'; group: 'Partner Loans' } }>("/settings/partners/retirement-confirm", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updatePartnerRetirementDate: (accountName: string, retirementDate: string | null) =>
    request<{ updated: number; entries: ClosingPreviewEntry[]; reactivated?: boolean }>("/settings/partners/retirement-date", {
      method: "PATCH",
      body: JSON.stringify({ account_name: accountName, retirement_date: retirementDate }),
    }),
  updateNotificationSettings: (payload: NotificationSettings) =>
    request<NotificationSettings>("/settings/notifications", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  exportDatabase: () => request<DatabaseExport>("/settings/export"),
  aiKeyStatus: () => request<AIKeyStatus>("/ai/session-key/status"),
  connectAIKey: (provider: AIProvider, model: string, apiKey: string) => request<AIKeyStatus>("/ai/session-key", {
    method: "POST",
    body: JSON.stringify({ provider, model, api_key: apiKey }),
  }),
  activateAIProvider: (provider: AIProvider) => request<AIKeyStatus>("/ai/session-key/active", {
    method: "PATCH",
    body: JSON.stringify({ provider }),
  }),
  disconnectAIProvider: (provider: AIProvider) => request<AIKeyStatus>(`/ai/session-key/${provider}`, { method: "DELETE" }),
  disconnectAllAIKeys: () => request<void>("/ai/session-key", { method: "DELETE" }),
  aiChat: (message: string, history: AIChatHistoryMessage[]) => request<AIChatResponse>("/ai/chat", {
    method: "POST",
    body: JSON.stringify({ message, history }),
  }),
  streamAIChat: async (
    message: string,
    history: AIChatHistoryMessage[],
    provider: AIProvider | undefined,
    signal: AbortSignal,
    onEvent: (event: AIChatStreamEvent) => void,
  ) => {
    const response = await fetch(`${API_BASE_URL}/ai/chat/stream`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({ message, history, provider }),
      signal,
    })
    if (!response.ok) {
      const body = await response.json().catch(() => null)
      throw new ApiError(formatApiError(body?.detail), response.status)
    }
    if (!response.body) throw new ApiError("Streaming is not supported by this browser.", 0)
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""
      for (const line of lines) {
        if (!line.trim()) continue
        onEvent(JSON.parse(line) as AIChatStreamEvent)
      }
      if (done) break
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as AIChatStreamEvent)
  },
};
