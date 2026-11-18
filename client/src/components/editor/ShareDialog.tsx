import { Check, Link2, LoaderCircle, Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { errorMessage } from '../../lib/api'
import { useDocuments } from '../../store/useDocuments'
import { useSession } from '../../store/useSession'
import type { Document, SharePermission } from '../../types'
import { Avatar } from '../ui/Avatar'
import { Modal } from '../ui/Modal'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const PERMISSION_LABELS: Record<SharePermission, string> = { viewer: 'Viewer', editor: 'Editor' }

interface ShareDialogProps {
  doc: Document
  onClose: () => void
}

export function ShareDialog({ doc, onClose }: ShareDialogProps) {
  const isOwner = doc.permission === 'owner'

  return (
    <Modal
      title={`Share “${doc.title}”`}
      description={
        isOwner
          ? 'Invite a CollabSpace user by email and choose what they can do.'
          : `Only ${doc.owner.name} can change who has access.`
      }
      onClose={onClose}
    >
      {isOwner && <InviteForm doc={doc} />}
      <AccessList doc={doc} canManage={isOwner} />
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
        <CopyLinkButton />
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          Done
        </button>
      </div>
    </Modal>
  )
}

function InviteForm({ doc }: { doc: Document }) {
  const { shareDocument } = useDocuments()
  const { users } = useSession()
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<SharePermission>('editor')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'success'; message: string } | null>(null)
  // Suggest demo accounts that don't have access yet.
  const suggestions = users.filter(
    (user) => user.id !== doc.owner.id && !doc.shares.some((share) => share.user.id === user.id),
  )

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const normalized = email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(normalized)) {
      setFeedback({ tone: 'error', message: 'Enter a valid email address.' })
      return
    }
    const existing = doc.shares.find((share) => share.user.email === normalized)
    setSubmitting(true)
    try {
      // The server checks ownership, resolves the email to a user and validates the permission.
      await shareDocument(doc.id, normalized, permission)
      setEmail('')
      setFeedback({
        tone: 'success',
        message: existing
          ? `Updated ${normalized} to ${PERMISSION_LABELS[permission].toLowerCase()}.`
          : `Shared with ${normalized} as ${PERMISSION_LABELS[permission].toLowerCase()}.`,
      })
    } catch (error) {
      setFeedback({ tone: 'error', message: errorMessage(error) })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="px-6 pt-5" noValidate>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setFeedback(null)
          }}
          placeholder={suggestions[0]?.email ?? 'name@example.com'}
          aria-label="Email address"
          list="share-email-suggestions"
          autoFocus
          className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10"
        />
        <datalist id="share-email-suggestions">
          {suggestions.map((user) => (
            <option key={user.id} value={user.email}>
              {user.name}
            </option>
          ))}
        </datalist>
        <div className="flex gap-2">
          <PermissionSelect value={permission} onChange={setPermission} label="Permission for new invite" />
          <button
            type="submit"
            disabled={!email.trim() || submitting}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && <LoaderCircle className="size-4 animate-spin" />}
            Share
          </button>
        </div>
      </div>
      {feedback && (
        <p className={`mt-2 text-sm ${feedback.tone === 'error' ? 'text-rose-600' : 'text-emerald-700'}`} role="status">
          {feedback.message}
        </p>
      )}
    </form>
  )
}

function AccessList({ doc, canManage }: { doc: Document; canManage: boolean }) {
  const { currentUser, updateSharePermission, removeShare } = useDocuments()
  const owner = doc.owner

  return (
    <div className="px-6 pt-5 pb-4">
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">People with access</h3>
      <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
        <AccessRow
          name={owner.id === currentUser.id ? `${owner.name} (you)` : owner.name}
          email={owner.email}
          avatar={<Avatar user={owner} size="sm" />}
          action={<span className="text-sm text-slate-500">Owner</span>}
        />
        {doc.shares.map(({ user, permission }) => (
          <AccessRow
            key={user.id}
            name={user.id === currentUser.id ? `${user.name} (you)` : user.name}
            email={user.email}
            avatar={<Avatar user={user} size="sm" />}
            action={
              canManage ? (
                <div className="flex items-center gap-1">
                  <PermissionSelect
                    value={permission}
                    onChange={(next) => updateSharePermission(doc.id, user.id, next)}
                    label={`Permission for ${user.email}`}
                    compact
                  />
                  <button
                    type="button"
                    onClick={() => removeShare(doc.id, user.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Remove ${user.email}`}
                    title="Remove access"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ) : (
                <span className="text-sm text-slate-500">{PERMISSION_LABELS[permission]}</span>
              )
            }
          />
        ))}
      </ul>
      {doc.shares.length === 0 && <p className="mt-2 text-sm text-slate-400">Not shared with anyone yet.</p>}
    </div>
  )
}

interface AccessRowProps {
  name: string
  email?: string
  avatar: ReactNode
  action: ReactNode
}

function AccessRow({ name, email, avatar, action }: AccessRowProps) {
  return (
    <li className="flex items-center gap-3 rounded-lg py-1.5">
      {avatar}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{name}</p>
        {email && <p className="truncate text-xs text-slate-500">{email}</p>}
      </div>
      {action}
    </li>
  )
}

interface PermissionSelectProps {
  value: SharePermission
  onChange: (permission: SharePermission) => void
  label: string
  compact?: boolean
}

function PermissionSelect({ value, onChange, label, compact = false }: PermissionSelectProps) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as SharePermission)}
      aria-label={label}
      className={`rounded-xl border border-slate-200 bg-white text-sm text-slate-700 outline-none focus:border-indigo-300 focus:ring-4 focus:ring-indigo-500/10 ${
        compact ? 'h-8 border-transparent px-2 hover:border-slate-200' : 'h-10 px-3'
      }`}
    >
      {(Object.keys(PERMISSION_LABELS) as SharePermission[]).map((permission) => (
        <option key={permission} value={permission}>
          {PERMISSION_LABELS[permission]}
        </option>
      ))}
    </select>
  )
}

function CopyLinkButton() {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this link:', window.location.href)
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      {copied ? <Check className="size-4 text-emerald-600" /> : <Link2 className="size-4 text-slate-400" />}
      {copied ? 'Link copied' : 'Copy link'}
    </button>
  )
}
