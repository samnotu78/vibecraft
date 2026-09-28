import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Serves POST /api/chat during `npm run dev`, using the same code as the Vercel function.
// Put GROQ_API_KEY=... in .env.local (no VITE_ prefix, so it never reaches the browser).
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api-chat',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let raw = ''
        for await (const chunk of req) raw += chunk
        const { handleChat } = await server.ssrLoadModule('/server/chatCore.ts')
        let body = {}
        try {
          body = JSON.parse(raw || '{}')
        } catch {
          /* empty body */
        }
        const out = await handleChat(body, { ...process.env, ...env })
        res.statusCode = out.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(out.json))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), devApi(env)],
  }
})
