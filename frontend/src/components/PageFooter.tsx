import { useFooterContent } from '../context/ContentContext'

export default function PageFooter() {
  const text = useFooterContent()
  return <footer style={{ marginTop: 24, padding: '14px 4px 4px', borderTop: '1px solid #E2E8F0', color: '#94A3B8', fontSize: 11.5, textAlign: 'center' }}>{text}</footer>
}
