interface Props {
  colSpan: number
  message?: string
}

export default function EmptyTableRow({ colSpan, message = 'No records found' }: Props) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div className="empty-state" style={{ padding: '32px 20px' }}>{message}</div>
      </td>
    </tr>
  )
}
