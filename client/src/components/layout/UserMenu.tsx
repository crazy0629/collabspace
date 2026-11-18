import { LayoutGrid, Star, User, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDocuments } from '../../store/useDocuments'
import { Avatar } from '../ui/Avatar'
import { Dropdown, MenuItem } from '../ui/Dropdown'
import { DemoAccountList } from './DemoAccountList'

export function UserMenu() {
  const { currentUser } = useDocuments()
  const navigate = useNavigate()

  return (
    <Dropdown
      panelClassName="w-64"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="ml-1 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          aria-label="Account menu"
          aria-expanded={open}
        >
          <Avatar user={currentUser} size="sm" />
        </button>
      )}
    >
      {(close) => {
        const go = (path: string) => {
          close()
          navigate(path)
        }
        return (
          <>
            <div className="border-b border-slate-100 px-3 py-3">
              <p className="truncate text-sm font-semibold text-slate-900">{currentUser.name}</p>
              <p className="truncate text-xs text-slate-500">{currentUser.email}</p>
            </div>
            <div className="py-1">
              <MenuItem icon={<LayoutGrid className="size-4 text-slate-400" />} onSelect={() => go('/')}>
                All Documents
              </MenuItem>
              <MenuItem icon={<User className="size-4 text-slate-400" />} onSelect={() => go('/my-documents')}>
                My Documents
              </MenuItem>
              <MenuItem icon={<Users className="size-4 text-slate-400" />} onSelect={() => go('/shared')}>
                Shared with Me
              </MenuItem>
              <MenuItem icon={<Star className="size-4 text-slate-400" />} onSelect={() => go('/favorites')}>
                Favorites
              </MenuItem>
            </div>
            <div className="border-t border-slate-100">
              <DemoAccountList onSwitched={close} />
            </div>
          </>
        )
      }}
    </Dropdown>
  )
}
