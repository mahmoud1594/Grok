import { defineConfig, type Connect, type Plugin, type PreviewServer, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import { zipFolder } from './scripts/zip-folder.mjs'

async function attachAuthRoutes(middlewares: Connect.Server) {
  const [
    { default: login },
    { default: session },
    { default: logout },
    { default: leads },
    { default: lead },
    { default: clients },
    { default: news },
    { default: calendar },
    { default: whatsappLinks },
  ] = await Promise.all([
    import('./api/login.js'),
    import('./api/session.js'),
    import('./api/logout.js'),
    import('./api/leads.js'),
    import('./api/leads/[id].js'),
    import('./api/clients.js'),
    import('./api/news.js'),
    import('./api/calendar.js'),
    import('./api/whatsapp-links.js'),
  ])
  const routes = new Map<string, Connect.NextHandleFunction>([
    ['/api/login', login as Connect.NextHandleFunction],
    ['/api/session', session as Connect.NextHandleFunction],
    ['/api/logout', logout as Connect.NextHandleFunction],
    ['/api/leads', leads as Connect.NextHandleFunction],
    ['/api/clients', clients as Connect.NextHandleFunction],
    ['/api/news', news as Connect.NextHandleFunction],
    ['/api/calendar', calendar as Connect.NextHandleFunction],
    ['/api/whatsapp-links', whatsappLinks as Connect.NextHandleFunction],
  ])
  middlewares.use((req, res, next) => {
    const path = req.url?.split('?')[0] ?? ''
    const handler = routes.get(path) ?? (path.startsWith('/api/leads/') ? (lead as Connect.NextHandleFunction) : undefined)
    if (!handler) {
      next()
      return
    }
    void Promise.resolve(handler(req, res, next)).catch(next)
  })
}

function hostnameBasePlugin(): Plugin {
  const loader = (kind: 'script' | 'style', file: string) => `<script>
(function () {
  var root = location.hostname === 'crm.askmontaser.ae' || location.hostname === 'crm.mahmouddxb.com' ? '/' : '/crm/';
  ${
    kind === 'script'
      ? `var node = document.createElement('script');
  node.type = 'module';
  node.crossOrigin = '';
  node.src = root + '${file}';`
      : `var node = document.createElement('link');
  node.rel = 'stylesheet';
  node.crossOrigin = '';
  node.href = root + '${file}';`
  }
  document.head.appendChild(node);
})();
</script>`
  return {
    name: 'hostname-base',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/<script type="module" crossorigin src="\/crm\/assets\/([^"]+)"><\/script>/, (_, file: string) =>
            loader('script', `assets/${file}`),
          )
          .replace(/<link rel="stylesheet" crossorigin href="\/crm\/assets\/([^"]+)">/, (_, file: string) =>
            loader('style', `assets/${file}`),
          )
      },
    },
  }
}

function apiRoutesPlugin(): Plugin {
  const attach = async (server: ViteDevServer | PreviewServer) => {
    await attachAuthRoutes(server.middlewares)
  }
  return {
    name: 'api-routes',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

function whatsappExtensionPlugin(): Plugin {
  return {
    name: 'whatsapp-extension-zip',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'whatsapp-crm-extension.zip', source: zipFolder('extension') })
    },
  }
}

const base = process.env.CRM_BASE || '/'

export default defineConfig({
  base,
  plugins: [react(), ...(base === '/' ? [] : [hostnameBasePlugin()]), apiRoutesPlugin(), whatsappExtensionPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
})
