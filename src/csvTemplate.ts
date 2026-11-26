import type { AppState, CatDef, Tx } from './types'
import { INCOME_CATEGORIES } from './types'
import { parseCsv } from './andromoney'
import { myAmount } from './logic'

/** 記帳模板欄位（匯出與匯入共用，順序可以不同，但需要這些欄名） */
export const TEMPLATE_HEADERS = ['日期', '類型', '金額', '分類', '子分類', '付款帳戶', '收入帳戶', '轉出帳戶', '轉入帳戶', '專案', '備註'] as const
type Header = (typeof TEMPLATE_HEADERS)[number]

const esc = (v: string | number | undefined) => {
  const s = v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const toCsv = (rows: (string | number | undefined)[][]) => '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')

/** 下載的空白模板（附兩行範例，帳戶名稱用你現有的帳戶） */
export function buildTemplateCsv(s: AppState): string {
  const a1 = s.accounts.find((a) => a.kind !== 'broker')?.name ?? '帳戶名稱'
  const a2 = s.accounts.find((a) => a.kind !== 'broker' && a.name !== a1)?.name ?? '帳戶名稱'
  const today = new Date().toISOString().slice(0, 10)
  return toCsv([
    [...TEMPLATE_HEADERS],
    [today, '支出', 120, '餐飲', '', a1, '', '', '', '', '午餐'],
    [today, '收入', 50000, '公司薪資', '', '', a2, '', '', '', '薪水'],
    [today, '轉帳', 3000, '一般轉帳', '', '', '', a1, a2, '', '轉到儲蓄'],
  ])
}

/** 匯出既有紀錄（證券交易與代墊回收不匯出；分帳只匯出自己的份額） */
export function buildExportCsv(s: AppState): string {
  const name = (id?: string) => s.accounts.find((a) => a.id === id)?.name ?? ''
  const rows: (string | number | undefined)[][] = [[...TEMPLATE_HEADERS]]
  for (const t of [...s.txs].sort((a, b) => a.date.localeCompare(b.date))) {
    if (t.trade || t.tag === 'collect') continue
    if (t.type === 'expense') {
      rows.push([t.date, '支出', myAmount(t), t.category ?? '', t.sub ?? '', name(t.fromId), '', '', '', t.project ?? '', t.note ?? ''])
    } else if (t.type === 'income') {
      rows.push([t.date, '收入', t.amount, t.category ?? '', t.sub ?? '', '', name(t.toId), '', '', t.project ?? '', t.note ?? ''])
    } else {
      rows.push([t.date, '轉帳', t.amount, t.category ?? '', t.sub ?? '', '', '', name(t.fromId), name(t.toId), t.project ?? '', t.note ?? ''])
    }
  }
  return toCsv(rows)
}

export interface TemplateRow { line: number; tx?: Omit<Tx, 'id'>; error?: string }

/** 解析模板：逐列檢查，錯誤的列會標出行號與原因，正確的列才會匯入 */
export function parseTemplate(text: string, s: AppState, expCats: CatDef[]): { header: string | null; rows: TemplateRow[] } {
  const table = parseCsv(text)
  if (!table.length) return { header: '檔案是空的', rows: [] }
  const head = table[0].map((h) => h.trim().replace(/^﻿/, ''))
  const idx = (h: Header) => head.indexOf(h)
  const missing = (['日期', '類型', '金額'] as Header[]).filter((h) => idx(h) < 0)
  if (missing.length) return { header: `缺少欄位：${missing.join('、')}（請使用模板）`, rows: [] }

  const accByName = (n: string) => s.accounts.find((a) => a.name.trim() === n.trim())
  const expKeys = new Set(expCats.map((c) => c.key))
  const incKeys = new Set(INCOME_CATEGORIES.map((c) => c.key))
  const rows: TemplateRow[] = []

  table.slice(1).forEach((r, i) => {
    const line = i + 2
    const get = (h: Header) => (idx(h) >= 0 ? (r[idx(h)] ?? '').trim() : '')
    const fail = (error: string) => rows.push({ line, error })
    const dateRaw = get('日期').replace(/\//g, '-')
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateRaw)
    if (!m) return fail('日期格式應為 2026-11-25')
    const date = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
    const amount = Math.round(Number(get('金額').replace(/,/g, '')))
    if (!(amount > 0)) return fail('金額必須是大於 0 的數字')
    const type = get('類型')
    const note = get('備註') || undefined
    const project = get('專案') || undefined
    const sub = get('子分類') || undefined

    if (type === '支出') {
      const acc = accByName(get('付款帳戶'))
      if (!acc) return fail(`找不到付款帳戶「${get('付款帳戶')}」`)
      const category = get('分類')
      if (!expKeys.has(category)) return fail(`分類「${category}」不存在，請用設定裡的分類名稱`)
      rows.push({ line, tx: { type: 'expense', date, amount, category, sub, fromId: acc.id, note, project } })
    } else if (type === '收入') {
      const acc = accByName(get('收入帳戶'))
      if (!acc) return fail(`找不到收入帳戶「${get('收入帳戶')}」`)
      const category = get('分類') || '其他收入'
      if (!incKeys.has(category)) return fail(`收入分類「${category}」不存在`)
      rows.push({ line, tx: { type: 'income', date, amount, category, toId: acc.id, note, project } })
    } else if (type === '轉帳') {
      const from = accByName(get('轉出帳戶'))
      const to = accByName(get('轉入帳戶'))
      if (!from) return fail(`找不到轉出帳戶「${get('轉出帳戶')}」`)
      if (!to) return fail(`找不到轉入帳戶「${get('轉入帳戶')}」`)
      if (from.id === to.id) return fail('轉出與轉入不能是同一個帳戶')
      rows.push({ line, tx: { type: 'transfer', date, amount, category: get('分類') || '一般轉帳', fromId: from.id, toId: to.id, note, project } })
    } else {
      fail('類型必須是「支出」「收入」或「轉帳」')
    }
  })
  return { header: null, rows }
}
