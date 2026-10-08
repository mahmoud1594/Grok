// Runs inside WhatsApp Web when the CRM shows it in a frame. Tells the CRM when the user really
// clicks in WhatsApp, so the CRM can tell that apart from WhatsApp moving focus on its own.
const crm = location.ancestorOrigins?.[0] ?? ''
const allowed =
  crm === 'https://crm.askmontaser.ae' ||
  crm === 'https://crm.mahmouddxb.com' ||
  crm === 'https://askmontaser-crm-preview.vercel.app' ||
  /^http:\/\/localhost(:\d+)?$/.test(crm)

if (window !== window.top && allowed) {
  const post = (type) => window.parent.postMessage({ source: 'askmontaser-wa', type }, crm)
  window.addEventListener('pointerdown', () => post('pointerdown'), true)
  post('ready')
}
