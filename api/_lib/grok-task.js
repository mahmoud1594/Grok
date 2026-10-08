// One Grok bot. Tasks from the CRM are follow-ups on this agent.
const DEFAULT_BOT_ID = 'bc-98dfcb45-64bc-4355-8a5f-60e20f3b8391'
const BOT_RE = /^bc-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_TASK = 4000

function grokBotId(env = process.env) {
  const id = String(env.GROK_BOT_ID || DEFAULT_BOT_ID).trim()
  if (!BOT_RE.test(id)) {
    const error = new Error('bad bot')
    error.code = 500
    throw error
  }
  return id
}

function grokConnected(env = process.env) {
  return Boolean(String(env.CURSOR_API_KEY || '').trim())
}

function taskPrompt(task) {
  const text = String(task ?? '').replace(/\r\n/g, '\n').trim()
  if (!text) {
    const error = new Error('empty')
    error.code = 400
    throw error
  }
  if (text.length > MAX_TASK) {
    const error = new Error('too long')
    error.code = 400
    throw error
  }
  return `Task from MahmoudDXB CRM.\n\n${text}`
}

function followupUrl(id) {
  return `https://api.cursor.com/v0/agents/${id}/followup`
}

function agentUrl(id) {
  return `https://cursor.com/agents/${id}`
}

const FOLLOW_UP_CALENDAR = 'mahmoud1594@gmail.com'

/** Grok writes with Mahmoud's own Google Calendar connection, which the CRM server does not have. */
function calendarTaskPrompt({ leadId, date, name, project }) {
  const who = name || 'Lead'
  const tag = `CRM lead id: ${leadId}`
  const find = `First search ${FOLLOW_UP_CALENDAR} for events whose description contains "${tag}".`
  if (!date) {
    return taskPrompt(
      `Calendar only. Do not change any code or files.\n${find} Delete every match. If there are none, do nothing.`,
    )
  }
  const details = [project, tag].filter(Boolean).join('\n')
  return taskPrompt(
    [
      'Calendar only. Do not change any code or files.',
      find,
      'Delete every match except one, then update that one (or create a new event if there is none) on Google Calendar with:',
      `- calendar: ${FOLLOW_UP_CALENDAR}`,
      `- title: Follow up: ${who}`,
      `- start: ${date} 10:00, end: ${date} 10:30, time zone Asia/Dubai`,
      `- description:\n${details}`,
      'Reply with one line: done or the error.',
    ].join('\n'),
  )
}

/** Lead follow-ups go to the Planner bot; until PLANNER_BOT_ID is set they go to the Grok bot. */
function plannerBotId(env = process.env) {
  const id = String(env.PLANNER_BOT_ID || '').trim()
  return BOT_RE.test(id) ? id : grokBotId(env)
}

async function sendGrokTask(prompt, env = process.env, bot = grokBotId(env)) {
  const key = String(env.CURSOR_API_KEY || '').trim()
  if (!key) return false
  const response = await fetch(followupUrl(bot), {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt: { text: prompt } }),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) console.error('grok followup failed', response.status)
  return response.ok
}

export {
  DEFAULT_BOT_ID,
  grokBotId,
  grokConnected,
  plannerBotId,
  taskPrompt,
  calendarTaskPrompt,
  sendGrokTask,
  followupUrl,
  agentUrl,
  MAX_TASK,
}
