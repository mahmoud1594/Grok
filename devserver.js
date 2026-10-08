// Local preview server mimicking Vercel: /api/* -> functions, else static (www/site, fallback landing-v2/site)
// ESM so it runs in this package ("type": "module"). Behaviour matches the CommonJS original.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const [,, root, port, ...fallbacks] = process.argv
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.woff2': 'font/woff2' }
http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  const m = p.match(/^\/api\/(.+?)(?:\/(.+))?$/)
  if (m) {
    let f = path.join(root, 'api', m[1] + '.js'), params = {}
    if (!fs.existsSync(f) && fs.existsSync(path.join(root, 'api', m[1], '[id].js'))) { f = path.join(root, 'api', m[1], '[id].js'); params.id = m[2] }
    else if (m[2] && fs.existsSync(path.join(root, 'api', m[1], '[id].js'))) { f = path.join(root, 'api', m[1], '[id].js'); params.id = m[2] }
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('no fn') }
    req.query = { ...Object.fromEntries(new URL(req.url, 'http://x').searchParams), ...params }
    res.status = (c) => { res.statusCode = c; return res }
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)) }
    try {
      const pkg = path.join(root, 'package.json')
      const esm = f.endsWith('.js') && fs.existsSync(pkg) && JSON.parse(fs.readFileSync(pkg, 'utf8')).type === 'module'
      const mod = esm ? await import(pathToFileURL(f).href) : require(f)
      await (mod.default || mod)(req, res)
    } catch (e) { console.error(e); res.statusCode = 500; res.end('err') }
    return
  }
  for (const r of [path.join(root, 'site'), ...fallbacks]) {
    let f = path.join(r, p)
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html')
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream'); return fs.createReadStream(f).pipe(res) }
  }
  if (!path.extname(p)) for (const r of [path.join(root, 'site'), ...fallbacks]) { const f = path.join(r, 'index.html'); if (fs.existsSync(f)) { res.setHeader('content-type', 'text/html'); return fs.createReadStream(f).pipe(res) } }
  res.statusCode = 404; res.end('404')
}).listen(+port, () => console.log('listening', port))
