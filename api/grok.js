// POST /api/grok — signed-in CRM users send one task to the single Grok bot.
import { requireAuth, setCors, handleOptions, readBody } from './_lib/auth.js'
import { grokBotId, grokConnected, taskPrompt, followupUrl, agentUrl } from './_lib/grok-task.js'

const send = (res, code, body) => {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'private, no-store')
  res.end(JSON.stringify(body))
}

export default async function handler(req, res) {
  setCors(req, res)
  if (req.method === 'OPTIONS') return handleOptions(req, res)
  if (!requireAuth(req)) return send(res, 401, { ok: false, error: 'unauthorized' })

  let bot
  try {
    bot = grokBotId()
  } catch {
    return send(res, 500, { ok: false, error: 'grok_not_connected' })
  }
  const url = agentUrl(bot)

  if (req.method === 'GET') {
    return send(res, 200, { ok: true, name: 'Grok', connected: grokConnected(), url })
  }
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'method_not_allowed' })
  if (!grokConnected()) return send(res, 503, { ok: false, error: 'grok_not_connected', url })

  let body = req.body
  if (!body || (typeof body === 'object' && !Object.keys(body).length)) {
    try {
      body = await readBody(req)
    } catch {
      return send(res, 400, { ok: false, error: 'bad_task' })
    }
  } else if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}')
    } catch {
      return send(res, 400, { ok: false, error: 'bad_task' })
    }
  }

  let prompt
  try {
    prompt = taskPrompt(body && body.task)
  } catch (error) {
    const code = error && error.code === 400 ? 400 : 500
    return send(res, code, { ok: false, error: code === 400 ? 'bad_task' : 'grok_unavailable' })
  }

  const key = String(process.env.CURSOR_API_KEY).trim()
  try {
    const response = await fetch(followupUrl(bot), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: { text: prompt } }),
    })
    if (!response.ok) {
      console.error('grok followup failed', response.status)
      return send(res, 502, { ok: false, error: 'grok_unavailable', url })
    }
    return send(res, 200, { ok: true, name: 'Grok', url })
  } catch (error) {
    console.error('grok followup failed', error && error.message)
    return send(res, 502, { ok: false, error: 'grok_unavailable', url })
  }
}
