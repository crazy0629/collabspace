import { getInitials } from '../../lib/format'
import type { User } from '../../types'

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-9 text-sm',
}

interface AvatarProps {
  user: User
  size?: keyof typeof SIZES
  className?: string
}

export function Avatar({ user, size = 'sm', className = '' }: AvatarProps) {
  return (
    <span
      title={user.name}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${user.color} ${SIZES[size]} ${className}`}
    >
      {getInitials(user.name)}
    </span>
  )
}

export function AvatarStack({ users, max = 3 }: { users: User[]; max?: number }) {
  const visible = users.slice(0, max)
  const overflow = users.length - visible.length
  return (
    <div className="flex -space-x-2">
      {visible.map((user) => (
        <Avatar key={user.id} user={user} size="xs" className="ring-2 ring-white" />
      ))}
      {overflow > 0 && (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 ring-2 ring-white">
          +{overflow}
        </span>
      )}
    </div>
  )
}
