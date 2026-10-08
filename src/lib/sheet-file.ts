// Reads an uploaded .csv or .xlsx in the browser into { columns, rows } (strings). No dependencies:
// XLSX is unzipped with DecompressionStream and the first worksheet is read with DOMParser.

export interface SheetTable {
  columns: string[]
  rows: string[][]
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '')
  const firstLine = src.slice(0, src.indexOf('\n') < 0 ? src.length : src.indexOf('\n'))
  const delimiter = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

async function inflate(data: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) return data
  if (method !== 8) throw new Error('Unsupported compression in this file')
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzip(buffer: ArrayBuffer): Promise<Map<string, () => Promise<string>>> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let end = -1
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 66000); i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('This is not a valid .xlsx file')
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const files = new Map<string, () => Promise<string>>()
  const decoder = new TextDecoder()
  for (let n = 0; n < count && view.getUint32(at, true) === 0x02014b50; n += 1) {
    const method = view.getUint16(at + 10, true)
    const size = view.getUint32(at + 20, true)
    const nameLen = view.getUint16(at + 28, true)
    const extraLen = view.getUint16(at + 30, true)
    const commentLen = view.getUint16(at + 32, true)
    const local = view.getUint32(at + 42, true)
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen))
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    files.set(name, async () => decoder.decode(await inflate(bytes.subarray(start, start + size), method)))
    at += 46 + nameLen + extraLen + commentLen
  }
  return files
}

function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

const xml = (text: string) => new DOMParser().parseFromString(text, 'application/xml')
const allText = (el: Element) => Array.from(el.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('')

export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const files = await unzip(buffer)
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const workbook = files.get('xl/workbook.xml')
  const rels = files.get('xl/_rels/workbook.xml.rels')
  if (workbook && rels) {
    const first = xml(await workbook()).getElementsByTagName('sheet')[0]
    const id = first?.getAttribute('r:id') ?? first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id')
    const rel = Array.from(xml(await rels()).getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === id)
    const target = rel?.getAttribute('Target')
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
  }
  const sheet = files.get(sheetPath)
  if (!sheet) throw new Error('No worksheet found in this file')
  const sharedFile = files.get('xl/sharedStrings.xml')
  const shared = sharedFile ? Array.from(xml(await sharedFile()).getElementsByTagName('si')).map(allText) : []
  const rows: string[][] = []
  for (const r of Array.from(xml(await sheet()).getElementsByTagName('row'))) {
    const out: string[] = []
    for (const c of Array.from(r.getElementsByTagName('c'))) {
      const ref = c.getAttribute('r')
      const index = ref ? columnIndex(ref) : out.length
      const type = c.getAttribute('t')
      const v = c.getElementsByTagName('v')[0]?.textContent ?? ''
      let value = type === 's' ? shared[Number(v)] ?? '' : type === 'inlineStr' ? allText(c) : v
      if (!type && /e\+?\d+$/i.test(value) && Number.isFinite(Number(value))) value = BigInt(Math.round(Number(value))).toString()
      while (out.length < index) out.push('')
      out[index] = value
    }
    if (out.some((cell) => cell.trim() !== '')) rows.push(out)
  }
  return rows
}

export async function readSheetFile(file: File): Promise<SheetTable> {
  const lower = file.name.toLowerCase()
  let all: string[][]
  if (lower.endsWith('.xlsx')) all = await parseXlsx(await file.arrayBuffer())
  else if (lower.endsWith('.csv') || lower.endsWith('.txt') || file.type.includes('csv')) all = parseCsv(await file.text())
  else throw new Error('Please choose a .csv or .xlsx file')
  if (all.length < 2) throw new Error('The file has no data rows')
  const [columns, ...rows] = all
  return { columns: columns.map((c) => c.trim()), rows }
}
