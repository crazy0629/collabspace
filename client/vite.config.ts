import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// VITE_* values are inlined into the public JavaScript bundle, so they must never hold secrets.
const SECRET_LIKE_NAME = /SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL/i
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Fails production builds that would ship without a usable API URL (or with secrets). */
function validateProductionEnv(env: Record<string, string>) {
  const problems: string[] = []
  const apiUrl = env.VITE_API_BASE_URL?.trim()

  if (!apiUrl) {
    problems.push('VITE_API_BASE_URL is not set. Production builds need the public URL of the API, e.g. https://collabspace-api.onrender.com/api')
  } else {
    let url: URL | null = null
    try {
      url = new URL(apiUrl)
    } catch {
      problems.push(`VITE_API_BASE_URL is not a valid absolute URL: "${apiUrl}"`)
    }
    if (url && url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
      problems.push(`VITE_API_BASE_URL must use https:// (plain http is only allowed for localhost): "${apiUrl}"`)
    }
  }

  const secretLike = Object.keys(env).filter((name) => SECRET_LIKE_NAME.test(name))
  if (secretLike.length) {
    problems.push(`These variables look like secrets, but VITE_* values are public in the built bundle: ${secretLike.join(', ')}`)
  }

  if (problems.length) {
    throw new Error(
      [
        '',
        'Production build configuration error:',
        ...problems.map((problem) => `  - ${problem}`),
        '',
        'Set variables in Vercel (Project > Settings > Environment Variables) or, for a local',
        'production build, in client/.env.production.local. See client/.env.example.',
        '',
      ].join('\n'),
    )
  }
}

export default defineConfig(({ command, mode }) => {
  if (command === 'build' && mode !== 'development') {
    validateProductionEnv(loadEnv(mode, process.cwd(), 'VITE_'))
  }
  return {
    plugins: [react(), tailwindcss()],
  }
})
