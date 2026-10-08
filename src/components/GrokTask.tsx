import { useState, type FormEvent } from 'react'
import { sendGrokTask } from '../lib/grok'

export default function GrokTask() {
  const [task, setTask] = useState('')
  const [sending, setSending] = useState(false)
  const [note, setNote] = useState('')
  const [url, setUrl] = useState('')

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const text = task.trim()
    if (!text || sending) return
    setSending(true)
    setNote('')
    try {
      const sent = await sendGrokTask(text)
      setTask('')
      setUrl(sent.url)
      setNote('Sent to Grok.')
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      setNote(code === 'grok_not_connected' ? 'Grok is not connected yet.' : 'Grok could not take that task.')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="grok-task" aria-label="Grok" onSubmit={(event) => void onSubmit(event)}>
      <h2>Grok</h2>
      <p>One bot. Send a task from here.</p>
      <textarea
        aria-label="Task for Grok"
        placeholder="What should Grok do?"
        value={task}
        maxLength={4000}
        rows={3}
        onChange={(event) => setTask(event.target.value)}
      />
      <div className="grok-task-row">
        <button type="submit" disabled={sending || !task.trim()}>
          {sending ? 'Sending…' : 'Send task'}
        </button>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            Open Grok
          </a>
        ) : null}
      </div>
      {note ? <p role="status">{note}</p> : null}
    </form>
  )
}
