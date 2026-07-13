import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { DataProvider } from './context/DataContext'
import { ToastProvider } from './context/ToastContext'
import { SettingsProvider } from './context/SettingsContext'
import { appName } from './config/app'
import Sidebar from './components/Sidebar'
import Header from './components/Header'
import SignIn from './pages/SignIn'
import Dashboard from './pages/Dashboard'
import JournalEntries from './pages/JournalEntries'
import Vouchers from './pages/Vouchers'
import Ledger from './pages/Ledger'
import CashBook from './pages/CashBook'
import BankBook from './pages/BankBook'
import TrialBalance from './pages/TrialBalance'
import TradingAccount from './pages/TradingAccount'
import ProfitLoss from './pages/ProfitLoss'
import BalanceSheet from './pages/BalanceSheet'
import DayBook from './pages/DayBook'
import ChartOfAccounts from './pages/ChartOfAccounts'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import NotificationCenter from './pages/NotificationCenter'
import UserManagement from './pages/UserManagement'
import CleanDatabase from './pages/CleanDatabase'
import AccountSummary from './pages/AccountSummary'
import ProfitAnalysis from './pages/ProfitAnalysis'
import CashFlowReport from './pages/CashFlowReport'
import { ContentProvider } from './context/ContentContext'
import PageFooter from './components/PageFooter'

export type PageId =
  | 'dashboard' | 'journal' | 'vouchers' | 'ledger'
  | 'cashbook' | 'bankbook' | 'trial-balance' | 'trading'
  | 'profit-loss' | 'balance-sheet' | 'daybook'
  | 'chart-of-accounts' | 'reports' | 'settings'
  | 'notifications' | 'user-management' | 'clean-db'
  | 'account-summary' | 'profit-analysis' | 'cash-flow-report'

function AppShell() {
  const [activePage, setActivePage] = useState<PageId>('dashboard')
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="app-loading">Loading {appName}...</div>
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
    <DataProvider>
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <Header activePage={activePage} onNavigate={setActivePage} />
      <main className="main-content">
        {pages[activePage]}
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
