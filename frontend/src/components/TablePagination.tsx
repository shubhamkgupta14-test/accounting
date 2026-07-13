interface Props {
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export default function TablePagination({ total, page, pageSize, onPageChange, onPageSizeChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const current = Math.min(page, pages)
  const start = total ? (current - 1) * pageSize + 1 : 0
  const end = Math.min(current * pageSize, total)
  return <div className="table-pagination" style={{ padding: '11px 16px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#64748B' }}>
    <span>Showing {start}–{end} of {total}</span>
    <label style={{ marginLeft: 'auto' }}>View</label>
    <select className="select" value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))} style={{ height: 30, paddingTop: 4, paddingBottom: 4, fontSize: 12 }}>
      {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
    </select>
    <button className="btn btn-secondary" disabled={current <= 1} onClick={() => onPageChange(current - 1)} style={{ padding: '4px 9px', fontSize: 12 }}>Previous</button>
    <span>Page {current} of {pages}</span>
    <button className="btn btn-secondary" disabled={current >= pages} onClick={() => onPageChange(current + 1)} style={{ padding: '4px 9px', fontSize: 12 }}>Next</button>
  </div>
}
