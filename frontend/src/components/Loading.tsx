export function Spinner({ size = 14 }: { size?: number }) {
  return <span className="loading-spinner" style={{ width: size, height: size }} aria-hidden="true" />
}

export function Skeleton({ width = '100%', height = 14, radius = 6 }: { width?: string | number; height?: number; radius?: number }) {
  return <span className="skeleton" style={{ display: 'block', width, height, borderRadius: radius }} aria-hidden="true" />
}

export function TableSkeletonRows({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return <>{Array.from({ length: rows }, (_, row) => <tr key={row} className="skeleton-table-row">
    {Array.from({ length: columns }, (_, column) => <td key={column}><Skeleton width={column === 1 ? '82%' : `${55 + ((row + column) % 4) * 10}%`} height={12} /></td>)}
  </tr>)}</>
}

export function PageSkeleton({ cards = 3, columns = 6, rows = 8 }: { cards?: number; columns?: number; rows?: number }) {
  return <div className="page-skeleton" aria-label="Loading page">
    <div className="page-header"><div style={{ display: 'grid', gap: 8 }}><Skeleton width={190} height={24} /><Skeleton width={360} height={13} /></div></div>
    {cards > 0 && <div className="skeleton-card-grid" style={{ gridTemplateColumns: `repeat(${cards}, minmax(0, 1fr))` }}>
      {Array.from({ length: cards }, (_, index) => <div className="card stat-card" key={index}><Skeleton width="48%" height={12} /><div style={{ height: 12 }} /><Skeleton width="68%" height={25} /></div>)}
    </div>}
    <div className="card"><div className="skeleton-toolbar"><Skeleton width={260} height={34} /><Skeleton width={120} height={34} /></div><table className="data-table"><thead><tr>{Array.from({ length: columns }, (_, index) => <th key={index}><Skeleton width="70%" height={10} /></th>)}</tr></thead><tbody><TableSkeletonRows rows={rows} columns={columns} /></tbody></table></div>
  </div>
}

export function ReportsSkeleton() {
  return <div aria-label="Loading reports"><div className="page-header"><div style={{ display: 'grid', gap: 8 }}><Skeleton width={150} height={24} /><Skeleton width={390} height={13} /></div></div>
    {[0, 1, 2, 3].map(section => <section key={section} style={{ marginBottom: 28 }}><Skeleton width={175} height={18} /><div style={{ height: 14 }} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {Array.from({ length: 4 }, (_, card) => <div className="card" style={{ padding: '18px 20px', display: 'grid', gap: 12 }} key={card}><Skeleton width={38} height={38} radius={10} /><Skeleton width="58%" height={15} /><Skeleton width="92%" height={12} /><Skeleton width="74%" height={12} /><Skeleton width={82} height={13} /></div>)}
    </div></section>)}
  </div>
}

export function CleanDatabaseSkeleton() {
  return <div aria-label="Loading database collections"><div className="page-header"><div style={{ display: 'grid', gap: 8 }}><Skeleton width={210} height={24} /><Skeleton width={360} height={13} /></div></div><div className="card" style={{ padding: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}><Skeleton width={170} height={34} /><Skeleton width={95} height={34} /><Skeleton width={150} height={34} /></div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>{Array.from({ length: 12 }, (_, index) => <div className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }} key={index}><Skeleton width={16} height={16} radius={3} /><Skeleton width={`${48 + (index % 3) * 12}%`} height={13} /></div>)}</div>
  </div></div>
}

export function SettingsSkeleton() {
  return <div aria-label="Loading settings"><div className="page-header"><div style={{ display: 'grid', gap: 8 }}><Skeleton width={130} height={24} /><Skeleton width={320} height={13} /></div></div><div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
    <div className="card" style={{ padding: 8, height: 'fit-content', display: 'grid', gap: 5 }}>{Array.from({ length: 6 }, (_, index) => <div style={{ display: 'flex', gap: 10, padding: '9px 12px' }} key={index}><Skeleton width={14} height={14} /><Skeleton width={`${48 + (index % 3) * 13}%`} height={14} /></div>)}</div>
    <div className="card" style={{ padding: '24px 28px' }}><Skeleton width={170} height={19} /><div style={{ height: 24 }} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>{Array.from({ length: 6 }, (_, index) => <div key={index}><Skeleton width={95} height={11} /><div style={{ height: 7 }} /><Skeleton height={38} /></div>)}</div><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}><Skeleton width={130} height={34} /></div></div>
  </div></div>
}

function HeaderSkeleton({ action = true }: { action?: boolean }) {
  return <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between' }}><div style={{ display: 'grid', gap: 8 }}><Skeleton width={190} height={24} /><Skeleton width={360} height={13} /></div>{action && <div style={{ display: 'flex', gap: 8 }}><Skeleton width={95} height={34} /><Skeleton width={125} height={34} /></div>}</div>
}

function StatSkeletons({ count }: { count: number }) {
  return <div className="skeleton-card-grid" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>{Array.from({ length: count }, (_, index) => <div className="card stat-card" key={index}><Skeleton width="50%" height={12} /><div style={{ height: 11 }} /><Skeleton width="66%" height={24} /></div>)}</div>
}

function TableCardSkeleton({ columns, rows = 8, filters = true }: { columns: number; rows?: number; filters?: boolean }) {
  return <div className="card">{filters && <div className="skeleton-toolbar"><Skeleton width={260} height={34} /><div style={{ display: 'flex', gap: 8 }}><Skeleton width={120} height={34} /><Skeleton width={120} height={34} /></div></div>}<table className="data-table"><thead><tr>{Array.from({ length: columns }, (_, index) => <th key={index}><Skeleton width="72%" height={10} /></th>)}</tr></thead><tbody><TableSkeletonRows rows={rows} columns={columns} /></tbody></table></div>
}

export function JournalSkeleton() { return <div><HeaderSkeleton /><TableCardSkeleton columns={7} /></div> }
export function VouchersSkeleton() { return <div><HeaderSkeleton /><div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} width={92} height={32} />)}</div><TableCardSkeleton columns={9} /></div> }
export function AccountsSkeleton() { return <div><HeaderSkeleton /><div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} width={105} height={32} />)}</div><TableCardSkeleton columns={6} /></div> }
export function DayBookSkeleton() { return <div><HeaderSkeleton action={false} /><div className="card skeleton-toolbar" style={{ marginBottom: 16 }}><Skeleton width={150} height={34} /><Skeleton width={150} height={34} /><Skeleton width={260} height={34} /></div><Skeleton width={250} height={16} /><div style={{ height: 10 }} /><TableCardSkeleton columns={6} filters={false} rows={6} /></div> }
export function LedgerSkeleton() { return <div><HeaderSkeleton /><div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}><div className="card" style={{ padding: 14, display: 'grid', gap: 12 }}><Skeleton height={32} />{Array.from({ length: 10 }, (_, i) => <div key={i} style={{ display: 'grid', gap: 5 }}><Skeleton width={`${58 + i % 3 * 10}%`} height={13} /><Skeleton width="42%" height={10} /></div>)}</div><div><div className="card" style={{ padding: '16px 20px', marginBottom: 14, display: 'flex', justifyContent: 'space-between' }}><div><Skeleton width={170} height={20} /><div style={{ height: 9 }} /><Skeleton width={220} height={14} /></div><Skeleton width={145} height={28} /></div><TableCardSkeleton columns={7} filters={false} /></div></div></div> }
export function BookSkeleton() { return <div><HeaderSkeleton /><StatSkeletons count={4} /><TableCardSkeleton columns={7} /></div> }
export function TrialBalanceSkeleton() { return <div><HeaderSkeleton /><StatSkeletons count={3} /><TableCardSkeleton columns={5} /></div> }
export function FinancialStatementSkeleton() { return <div><HeaderSkeleton /><StatSkeletons count={3} /><div className="card"><div className="skeleton-toolbar"><Skeleton width={180} height={17} /></div><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}><table className="data-table"><tbody><TableSkeletonRows rows={9} columns={2} /></tbody></table><table className="data-table"><tbody><TableSkeletonRows rows={9} columns={2} /></tbody></table></div></div></div> }
export function ManagementReportSkeleton() { return <div><HeaderSkeleton action /><TableCardSkeleton columns={4} filters={false} rows={7} /></div> }
export function AccountSummarySkeleton() { return <div><HeaderSkeleton action /><TableCardSkeleton columns={3} filters={false} rows={8} /></div> }
export function UserManagementSkeleton() { return <div><HeaderSkeleton action={false} /><div className="card" style={{ padding: 20, marginBottom: 20 }}><Skeleton width={120} height={17} /><div style={{ height: 14 }} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.5fr 1fr 140px', gap: 10 }}>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={38} />)}</div><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><Skeleton width={120} height={34} /></div></div><TableCardSkeleton columns={6} filters={false} rows={7} /></div> }
export function NotificationsSkeleton() { return <div><HeaderSkeleton action={false} /><div className="card" style={{ padding: 20, marginBottom: 20 }}><Skeleton width={190} height={17} /><div style={{ height: 14 }} /><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 160px', gap: 12 }}><Skeleton height={38} /><Skeleton height={38} /><Skeleton height={38} /></div><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}><Skeleton width={85} height={34} /></div></div><div className="card">{Array.from({ length: 7 }, (_, i) => <div key={i} style={{ padding: '14px 18px', display: 'flex', gap: 12, borderBottom: '1px solid var(--border)' }}><Skeleton width={16} height={16} radius={8} /><div style={{ flex: 1, display: 'grid', gap: 7 }}><Skeleton width="24%" height={14} /><Skeleton width={`${68 + i % 3 * 8}%`} height={12} /><Skeleton width="12%" height={10} /></div></div>)}</div></div> }

export function PageSkeletonFor({ page }: { page: string }) {
  if (page === 'dashboard') return <PageSkeleton cards={5} columns={6} rows={5} />
  if (page === 'journal') return <JournalSkeleton />
  if (page === 'vouchers') return <VouchersSkeleton />
  if (page === 'ledger') return <LedgerSkeleton />
  if (page === 'cashbook' || page === 'bankbook') return <BookSkeleton />
  if (page === 'trial-balance') return <TrialBalanceSkeleton />
  if (page === 'trading' || page === 'profit-loss' || page === 'balance-sheet') return <FinancialStatementSkeleton />
  if (page === 'daybook') return <DayBookSkeleton />
  if (page === 'chart-of-accounts') return <AccountsSkeleton />
  if (page === 'reports') return <ReportsSkeleton />
  if (page === 'settings' || page === 'partners') return <SettingsSkeleton />
  if (page === 'clean-db') return <CleanDatabaseSkeleton />
  if (page === 'account-summary') return <AccountSummarySkeleton />
  if (page === 'profit-analysis' || page === 'cash-flow-report') return <ManagementReportSkeleton />
  if (page === 'notifications') return <NotificationsSkeleton />
  if (page === 'user-management') return <UserManagementSkeleton />
  return <PageSkeleton />
}
