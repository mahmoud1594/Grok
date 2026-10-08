#!/usr/bin/env node
// One-time Bitrix import into the Leads store. Usage:
//   LEADS_BACKEND=sheets LEADS_SHEET_ID=... GOOGLE_SA_EMAIL=... GOOGLE_SA_KEY="$(cat key.pem)" node import-bitrix.js bitrix-leads.json [--dry]
// Input: the CRM's Bitrix lead export (array of {bitrixId,name,phone,email,dealUrl,projectInterest,status,assignedAt,sourceChannel,...}).
// Re-running is safe: rows whose bitrix_id is already in the Sheet are skipped.
const fs = require('fs');
const store = require('./leads-store.js');
const file = process.argv[2]; const dry = process.argv.includes('--dry');
if (!file) { console.error('usage: node import-bitrix.js <bitrix-leads.json> [--dry]'); process.exit(1); }
const mapStatus = (s) => { s = (s || '').toLowerCase();
  if (/deal lost|junk|not interested|not reachable/.test(s)) return 'lost';
  if (/qualified/.test(s)) return 'qualified'; if (/contacted|cold/.test(s)) return 'contacted'; return 'new'; };
const phone = (p) => { p = String(p || '').replace(/[^\d+]/g, ''); if (!p) return ''; if (p.startsWith('00')) p = '+' + p.slice(2); return p.startsWith('+') ? p : '+' + p; };
const raw = JSON.parse(fs.readFileSync(file, 'utf8')); const list = Array.isArray(raw) ? raw : raw.leads;
const rows = list.map((l) => ({
  created_at: l.assignedAt ? l.assignedAt + 'T09:00:00+04:00' : undefined,
  source: /bitrix/i.test(l.sourceChannel || 'bitrix') ? 'bitrix' : 'manual',
  name: l.name || '', phone: phone(l.phone), email: l.email || '',
  interest: /secondary|resale|ready/i.test(l.buyRent + ' ' + l.projectInterest) ? 'secondary' : (l.projectInterest ? 'offplan' : 'other'),
  project_or_community: l.projectInterest || '', budget_aed: l.budget || '', beds: l.beds || '',
  message: [l.unitType && 'Unit: ' + l.unitType, l.buyRent && 'Buy/rent: ' + l.buyRent, l.timeline && 'Timeline: ' + l.timeline].filter(Boolean).join(' · '),
  status: mapStatus(l.status), owner: 'Mahmoud', next_action_date: l.reminder || '',
  notes: [l.status && 'Bitrix stage: ' + l.status, l.sourceChannel && 'Channel: ' + l.sourceChannel, l.comment].filter(Boolean).join('\n'),
  consent: '', bitrix_id: String(l.bitrixId || ''), deal_url: l.dealUrl || '',
}));
if (dry) { console.log(JSON.stringify(rows.slice(0, 3), null, 1), '\n', rows.length, 'rows mapped (dry run)'); process.exit(0); }
store.bulkImport(rows).then((r) => console.log('import done', r)).catch((e) => { console.error(e.message); process.exit(1); });
