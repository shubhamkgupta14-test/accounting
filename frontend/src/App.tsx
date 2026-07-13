import { lazy, Suspense, useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider, useLedgerData } from './context/DataContext'
import { ToastProvider } from './context/ToastContext'
import { SettingsProvider } from './context/SettingsContext'
import { appName } from './config/app'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import SignIn from './pages/SignIn'
import { ContentProvider } from './context/ContentContext'
import PageFooter from './components/PageFooter'
import { PageSkeletonFor, Spinner } from './components/Loading'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const JournalEntries = lazy(() => import('./pages/JournalEntries'))
const Vouchers = lazy(() => import('./pages/Vouchers'))
const Ledger = lazy(() => import('./pages/Ledger'))
const CashBook = lazy(() => import('./pages/CashBook'))
const BankBook = lazy(() => import('./pages/BankBook'))
const TrialBalance = lazy(() => import('./pages/TrialBalance'))
const TradingAccount = lazy(() => import('./pages/TradingAccount'))
const ProfitLoss = lazy(() => import('./pages/ProfitLoss'))
const BalanceSheet = lazy(() => import('./pages/BalanceSheet'))
const DayBook = lazy(() => import('./pages/DayBook'))
const ChartOfAccounts = lazy(() => import('./pages/ChartOfAccounts'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))
const NotificationCenter = lazy(() => import('./pages/NotificationCenter'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const CleanDatabase = lazy(() => import('./pages/CleanDatabase'))
const AccountSummary = lazy(() => import('./pages/AccountSummary'))
const ProfitAnalysis = lazy(() => import('./pages/ProfitAnalysis'))
const CashFlowReport = lazy(() => import('./pages/CashFlowReport'))

export type PageId =
  | 'dashboard' | 'journal' | 'vouchers' | 'ledger'
  | 'cashbook' | 'bankbook' | 'trial-balance' | 'trading'
  | 'profit-loss' | 'balance-sheet' | 'daybook'
  | 'chart-of-accounts' | 'reports' | 'settings'
  | 'notifications' | 'user-management' | 'clean-db'
  | 'account-summary' | 'profit-analysis' | 'cash-flow-report'

function DataLoadingGate({ page, children }: { page: PageId; children: React.ReactNode }) {
  const { loading } = useLedgerData()
  const waitsForSharedData = ['journal', 'ledger', 'cashbook', 'bankbook', 'trial-balance', 'trading', 'profit-loss', 'balance-sheet', 'chart-of-accounts', 'account-summary', 'profit-analysis', 'cash-flow-report'].includes(page)
  if (loading && waitsForSharedData) return <PageSkeletonFor page={page} />
  return children
}

function AppShell() {
  const [activePage, setActivePage] = useState<PageId>('dashboard')
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="app-loading"><Spinner size={20} /> Loading {appName}...</div>
  }

  if (!user) {
    return <SignIn />
  }

  const pages: Record<PageId, React.ReactNode> = {
    'dashboard': <Dashboard onNavigate={setActivePage} />,
    'journal': <JournalEntries />,
    'vouchers': <Vouchers />,
    'ledger': <Ledger onNavigate={setActivePage} />,
    'cashbook': <CashBook />,
    'bankbook': <BankBook />,
    'trial-balance': <TrialBalance />,
    'trading': <TradingAccount />,
    'profit-loss': <ProfitLoss />,
    'balance-sheet': <BalanceSheet />,
    'daybook': <DayBook />,
    'chart-of-accounts': <ChartOfAccounts />,
    'reports': <Reports onNavigate={setActivePage} />,
    'settings': <Settings />,
    'notifications': <NotificationCenter />,
    'user-management': <UserManagement />,
    'clean-db': <CleanDatabase />,
    'account-summary': <AccountSummary />,
    'profit-analysis': <ProfitAnalysis />,
    'cash-flow-report': <CashFlowReport />,
  }
  return (
    <DataProvider activePage={activePage}>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <Header activePage={activePage} onNavigate={setActivePage} />
      <main className="main-content">
        <DataLoadingGate page={activePage}><Suspense fallback={<PageSkeletonFor page={activePage} />}>{pages[activePage]}</Suspense></DataLoadingGate>
        <PageFooter />
      </main>
    </DataProvider>
  )
}

export default function App() {
  return (
    <ContentProvider><ToastProvider>
      <AuthProvider>
        <SettingsProvider><AppShell /></SettingsProvider>
      </AuthProvider>
    </ToastProvider></ContentProvider>
  )
}
