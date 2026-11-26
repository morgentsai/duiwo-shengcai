import type { Account, Tx } from './types'
import { mapCat } from './catmigrate'

/** AndroMoney 帳戶名稱 → App 帳戶 id */
const ACCOUNT_MAP: Record<string, string> = {
  台新Richart信用卡: 'c-richart',
  國泰Cube: 'c-cube',
  現金: 'cash',
  台新Richart: 'richart',
  永豐大戶: 'sinopac',
  中信LINEPAY: 'c-linepay',
  兆豐: 'mega',
  LINEPAYMONEY: 'linepay-money',
  永豐證卷: 'br-sinopac',
  永豐證券: 'br-sinopac',
  凱基誠品: 'c-kgi',
  玉山: 'esun',
  國泰: 'cathay',
  國泰世華: 'cathay',
  凱基: 'kgi',
  台新: 'taishin',
  台北富邦: 'fubon',
  富邦: 'fubon',
}

const norm = (s: string) => s.replace(/\s+/g, '')

/** 簡易 CSV 解析（支援引號與逗號） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cur); rows.push(row); row = []; cur = ''
    } else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter((r) => r.some((x) => x.trim()))
}

/** 讀檔：先試 UTF-8，若出現亂碼再用 Big5/CP950 解碼 */
export async function readCsvFile(f: File): Promise<string> {
  const buf = await f.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (!utf8.includes('\uFFFD')) return utf8.replace(/^\uFEFF/, '')
  return new TextDecoder('big5').decode(buf)
}

function mapIncome(cat: string, sub: string): { category: string; sub?: string } {
  if (cat === '一般收入') {
    if (['公司薪資', '家教', '利息', '租屋補助', '信用卡回饋'].includes(sub)) return { category: sub }
    if (sub === '退款') return { category: '退款/其他', sub: '退款' }
    return { category: '退款/其他', sub: sub || undefined }
  }
  if (cat === '投資收入') return { category: '投資配息/折讓/獲利', sub: sub || undefined }
  if (cat === '代墊款') return { category: '代墊款回收', sub: sub === '代墊款' ? undefined : sub === '朋友吃飯轉帳付錢' ? '朋友聚餐' : sub || undefined }
  return { category: '退款/其他', sub: [cat, sub].filter(Boolean).join('/') || undefined }
}

/** AndroMoney 分類 → App 10 分類：AndroMoney 的名稱就是對照表的來源名稱，直接套用同一套分類對照 */
function mapExpense(cat: string, sub: string): { category: string; sub?: string } {
  const sb = sub.toLowerCase() === 'ai' ? 'ai' : sub
  // 舊 App 的「代墊款」：幫朋友先付的錢，保留為停用分類「代墊款」（不併入其他分類，避免灌水某類花費）
  if (cat === '代墊款') return { category: '代墊款', sub: '代墊款' }
  const r = mapCat(cat, sb || undefined)
  // 理財投資等非消費分類：保留原名，方便事後調整（App 會把它當自訂分類顯示）
  return { category: r.category || '未分類', sub: r.sub }
}

export interface AmImport {
  txs: Tx[]
  newAccounts: Account[]
  skipped: number
  unknownAccounts: string[]
  range: [string, string] | null
}

/** alias：分類改名後，用目前名稱（傳入 state 的 catAlias） */
export function convertAndroMoney(text: string, accounts: Account[], alias?: (cat: string, sub?: string) => { category: string; sub?: string }): AmImport {
  const rows = parseCsv(text)
  const hi = rows.findIndex((r) => r.includes('金額') && r.includes('分類') && r.includes('日期'))
  if (hi < 0) throw new Error('找不到 AndroMoney 欄位標題（金額／分類／日期）')
  const H = rows[hi]
  const col = (name: string) => H.findIndex((h) => h.trim().startsWith(name))
  const c = {
    id: col('Id'), cur: col('幣別'), amt: col('金額'), cat: col('分類'), sub: col('子分類'), date: col('日期'),
    from: col('付款'), to: col('收款'), note: col('備註'), proj: col('專案'), shop: col('商家'), uid: col('uid'),
  }
  const known = new Map(accounts.map((a) => [norm(a.name), a.id]))
  const newAccounts: Account[] = []
  const unknown = new Set<string>()
  const resolve = (name: string): string | undefined => {
    const n = norm(name)
    if (!n) return undefined
    const id = ACCOUNT_MAP[n] ?? known.get(n)
    if (id) return id
    // 未知帳戶：自動新增（名稱含「卡」視為信用卡、含「證」視為證券戶，其餘為銀行）
    const nid = 'am-' + n
    if (!newAccounts.some((a) => a.id === nid)) {
      const kind = /卡|熊本熊|信用/.test(n) ? 'card' : /證/.test(n) ? 'broker' : 'bank'
      newAccounts.push({
        id: nid, name: name.trim(), kind, balance: 0, color: '#8E8E93', tag: 'AndroMoney 匯入',
        ...(kind === 'card' ? { billed: 0, unbilled: 0, payAccountId: n.startsWith('國泰') ? 'cathay' : n.startsWith('玉山') ? 'esun' : n.startsWith('台新') ? 'richart' : n.startsWith('永豐') ? 'sinopac' : n.startsWith('凱基') ? 'kgi' : 'mega', statementDay: 5, dueDay: 20, primary: false } : {}),
      })
      unknown.add(name.trim())
    }
    return nid
  }

  const txs: Tx[] = []
  let skipped = 0
  for (const r of rows.slice(hi + 1)) {
    const cat = (r[c.cat] ?? '').trim()
    const sub = (r[c.sub] ?? '').trim()
    const amount = Math.round(Math.abs(Number((r[c.amt] ?? '').replace(/,/g, ''))))
    const d = (r[c.date] ?? '').replace(/\D/g, '')
    if (!amount || d.length !== 8 || cat === 'SYSTEM' || ((r[c.cur] ?? 'TWD').trim() || 'TWD') !== 'TWD') { skipped++; continue }
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
    const fromName = (r[c.from] ?? '').trim()
    const toName = (r[c.to] ?? '').trim()
    const note = [r[c.note], c.shop >= 0 ? r[c.shop] : ''].map((x) => (x ?? '').trim()).filter(Boolean).join('・')
    const project = c.proj >= 0 ? (r[c.proj] ?? '').trim() || undefined : undefined
    const key = (c.uid >= 0 && r[c.uid]) || `${r[c.id]}-${d}-${amount}`
    const base = { id: `am-${key}`, amount, date, note, project }
    if (fromName && toName) {
      const fromId = resolve(fromName)
      const toId = resolve(toName)
      const toAcc = accounts.find((a) => a.id === toId) ?? newAccounts.find((a) => a.id === toId)
      const isCash = toId === 'cash'
      const category = cat === '信用卡費' || toAcc?.kind === 'card' ? '信用卡費' : cat === '投資' ? '投資' : isCash ? '領現' : '一般轉帳'
      const tsub = cat === '投資' ? (sub === '投資' ? '投入' : sub === '獲利了解' ? '獲利了結' : sub || undefined) : undefined
      txs.push({ ...base, type: 'transfer', fromId, toId, category, sub: tsub, tag: category === '信用卡費' ? 'cardpay' : isCash ? 'withdraw' : undefined })
    } else if (toName) {
      txs.push({ ...base, type: 'income', toId: resolve(toName), ...mapIncome(cat, sub) })
    } else if (fromName) {
      txs.push({ ...base, type: 'expense', fromId: resolve(fromName), ...(() => { const m = mapExpense(cat, sub); return alias && m.category !== '代墊款' ? alias(m.category, m.sub) : m })() })
    } else skipped++
  }
  const dates = txs.map((t) => t.date).sort()
  return { txs, newAccounts, skipped, unknownAccounts: [...unknown], range: dates.length ? [dates[0], dates[dates.length - 1]] : null }
}
