import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'

const { default: login } = await import('../api/login.js')
const { default: session } = await import('../api/session.js')
const { default: logout } = await import('../api/logout.js')

const root = join(process.cwd(), 'dist')
const port = Number(process.env.PORT || 4173)
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

const routes = {
  '/api/login': login,
  '/api/session': session,
  '/api/logout': logout,
}

const server = createServer((req, res) => {
  const path = (req.url || '/').split('?')[0]
  if (path === '/crm' || path === '/crm/') {
    res.statusCode = 302
    res.setHeader('Location', '/')
    res.end()
    return
  }
  const handler = routes[path]
  if (handler) {
    void Promise.resolve(handler(req, res)).catch((error) => {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Server error' }))
    })
    return
  }
  const rel = normalize(path).replace(/^[/\\]+/, '')
  const file = join(root, rel)
  if (rel && !file.startsWith(root)) {
    res.statusCode = 400
    res.end('Bad path')
    return
  }
  if (rel && existsSync(file) && statSync(file).isFile()) {
    res.statusCode = 200
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    if (path.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    createReadStream(file).pipe(res)
    return
  }
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  createReadStream(join(root, 'index.html')).pipe(res)
})

server.listen(port, '127.0.0.1', () => {
  console.log(`standalone http://127.0.0.1:${port}`)
})
