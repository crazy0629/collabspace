import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDocuments } from '../store/useDocuments'
import { useToast } from '../store/useToast'

/** Creates a blank document on the server and opens it in the editor. */
export function useCreateDocument() {
  const { createDocument } = useDocuments()
  const navigate = useNavigate()
  const toast = useToast()
  const [creating, setCreating] = useState(false)

  const create = useCallback(async () => {
    if (creating) return
    setCreating(true)
    try {
      const doc = await createDocument()
      navigate(`/documents/${doc.id}`)
    } catch (error) {
      toast.error(error)
    } finally {
      setCreating(false)
    }
  }, [creating, createDocument, navigate, toast])

  return { create, creating }
}
