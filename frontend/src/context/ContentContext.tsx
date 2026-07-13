import { createContext, useContext, useEffect, useState } from 'react'
import { api, type PageContentResponse } from '../lib/api'
import { useAuth } from './AuthContext'

const empty: PageContentResponse = { pages: {}, footer: '' }
const ContentContext = createContext(empty)

export function ContentProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [content, setContent] = useState(empty)
  useEffect(() => {
    let active = true
    const request = user ? api.content() : api.loginContent()
    request.then(result => { if (active) setContent(result) }).catch(() => undefined)
    return () => { active = false }
  }, [user])
  return <ContentContext.Provider value={content}>{children}</ContentContext.Provider>
}

export const usePageContent = (id: string) => useContext(ContentContext).pages[id] || { title: '', description: '' }
export const useFooterContent = () => useContext(ContentContext).footer
