import { createContext, useContext, useEffect, useState } from 'react'
import { api, type PageContentResponse } from '../lib/api'

const empty: PageContentResponse = { pages: {}, footer: '' }
const ContentContext = createContext(empty)

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const [content, setContent] = useState(empty)
  useEffect(() => { api.content().then(setContent).catch(() => undefined) }, [])
  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>
}

export const usePageContent = (id: string) => useContext(ContentContext).pages[id] || { title: '', description: '' }
export const useFooterContent = () => useContext(ContentContext).footer
