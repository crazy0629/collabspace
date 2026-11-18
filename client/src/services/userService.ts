import { apiRequest } from '../lib/api'
import { toUser } from '../lib/users'
import type { User } from '../types'

interface UserDto {
  id: string
  name: string
  email: string
}

export async function listUsers(): Promise<User[]> {
  const { users } = await apiRequest<{ users: UserDto[] }>('GET', '/users')
  return users.map(toUser)
}
