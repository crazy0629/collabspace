import { Check } from 'lucide-react'
import { useSession } from '../../store/useSession'
import { Avatar } from '../ui/Avatar'

/** Menu section for switching the simulated signed-in account. */
export function DemoAccountList({ onSwitched }: { onSwitched: () => void }) {
  const { users, currentUser, switchUser } = useSession()

  return (
    <div className="py-1">
      <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
        Demo accounts
      </p>
      {users.map((user) => {
        const active = user.id === currentUser.id
        return (
          <button
            key={user.id}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => {
              onSwitched()
              if (!active) switchUser(user.id)
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            <Avatar user={user} size="xs" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{user.name}</span>
              <span className="block truncate text-xs text-slate-500">{user.email}</span>
            </span>
            {active && <Check className="size-4 text-indigo-600" />}
          </button>
        )
      })}
      <p className="px-3 pt-1 pb-1.5 text-[11px] leading-snug text-slate-400">
        Simulated sign-in for demo purposes only.
      </p>
    </div>
  )
}
