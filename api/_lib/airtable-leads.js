// Leads stored in the Ask MonTaser Leads base. Phones stay on the server.
// Env: AIRTABLE_TOKEN (personal access token, data.records read and write on this base).
//      AIRTABLE_BASE_ID optional, defaults to the CRM leads base.
//      AIRTABLE_TABLE optional, defaults to Leads.
const BASE_ID = 'appIBzGl2Pfcd8oNq';
const TABLE = 'Leads';
const STATUS_LABEL = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  viewing: 'Viewing',
  won: 'Won',
  lost: 'Lost',
  archived: 'Archived',
};
const LABEL_STATUS = Object.fromEntries(Object.entries(STATUS_LABEL).map(([key, label]) => [label.toLowerCase(), key]));

export function airtableConfigured(env = process.env) {
  return Boolean(String(env.AIRTABLE_TOKEN || '').trim());
}

function baseId(env) {
  return String(env.AIRTABLE_BASE_ID || BASE_ID).trim();
}

function tableName(env) {
  return String(env.AIRTABLE_TABLE || TABLE).trim() || TABLE;
}

function statusToLabel(status) {
  const key = String(status || '').trim().toLowerCase();
  return STATUS_LABEL[key] || '';
}

function statusFromLabel(label) {
  const key = String(label || '').trim().toLowerCase();
  return LABEL_STATUS[key] || key || 'new';
}

export function recordToLead(record) {
  const fields = (record && record.fields) || {};
  const created = record.createdTime || '';
  return {
    lead_id: record.id,
    created_at: created,
    updated_at: created,
    source: fields.Source || '',
    name: fields.Name || '',
    phone: fields.Phone || '',
    email: fields.Email || '',
    interest: fields.Interest || '',
    project_or_community: fields.Project || '',
    budget_aed: '',
    beds: '',
    country_program: '',
    message: fields.Message || '',
    status: statusFromLabel(fields.Status),
    owner: fields.Owner || '',
    next_action_date: fields['Next action'] || '',
    notes: fields.Notes || '',
    utm_source: '',
    utm_campaign: '',
    page_url: '',
    consent: '',
    bitrix_id: '',
    deal_url: fields['Deal URL'] || '',
    comment: fields.Comment || '',
  };
}

export function patchToFields(patch) {
  const fields = {};
  if ('name' in patch) fields.Name = patch.name;
  if ('status' in patch) fields.Status = statusToLabel(patch.status) || null;
  if ('owner' in patch) fields.Owner = patch.owner;
  if ('next_action_date' in patch) fields['Next action'] = patch.next_action_date || null;
  if ('notes' in patch) fields.Notes = patch.notes;
  if ('comment' in patch) fields.Comment = patch.comment;
  return fields;
}

async function airtable(env, path, { method = 'GET', body } = {}) {
  const token = String(env.AIRTABLE_TOKEN || '').trim();
  const response = await fetch(`https://api.airtable.com/v0/${baseId(env)}/${encodeURIComponent(tableName(env))}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 404) throw Object.assign(new Error('not found'), { code: 404 });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload.error && payload.error.message) || `airtable ${response.status}`;
    throw Object.assign(new Error(message), { code: response.status === 401 || response.status === 403 ? 503 : 502 });
  }
  return payload;
}

export async function listAirtableLeads(env = process.env) {
  const leads = [];
  let offset = '';
  do {
    const page = await airtable(env, offset ? `?pageSize=100&offset=${encodeURIComponent(offset)}` : '?pageSize=100');
    for (const record of page.records || []) leads.push(recordToLead(record));
    offset = page.offset || '';
  } while (offset);
  return leads;
}

export async function updateAirtableLead(id, patch, env = process.env) {
  const fields = patchToFields(patch);
  if (!Object.keys(fields).length) throw Object.assign(new Error('nothing to update'), { code: 400 });
  const payload = await airtable(env, `/${encodeURIComponent(id)}`, { method: 'PATCH', body: { fields } });
  return recordToLead(payload);
}

export async function deleteAirtableLead(id, env = process.env) {
  await airtable(env, `/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return { lead_id: id };
}

export async function appendAirtableLead(lead, env = process.env) {
  const fields = {
    Name: lead.name || '',
    Status: statusToLabel(lead.status || 'new') || 'New',
    Project: lead.project_or_community || '',
    Comment: lead.comment || '',
    Notes: lead.notes || '',
    Source: lead.source || '',
    Interest: lead.interest || '',
    Owner: lead.owner || '',
    Message: lead.message || '',
  };
  if (lead.phone) fields.Phone = lead.phone;
  if (lead.email) fields.Email = lead.email;
  if (lead.next_action_date) fields['Next action'] = lead.next_action_date;
  if (lead.deal_url) fields['Deal URL'] = lead.deal_url;
  const payload = await airtable(env, '', { method: 'POST', body: { fields } });
  return recordToLead(payload);
}
