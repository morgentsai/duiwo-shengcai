import { useMemo } from 'react'
import type { Tx } from '../types'
import { useStore } from '../store'
import { cashDateOf, compact, myAmount, todayStr } from '../logic'
import type { StatMode } from '../logic'

const WD = ['日', '一', '二', '三', '四', '五', '六']
const addDays = (d: string, n: number) => {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10)
}
const weekday = (d: string) => {
  const [y, m, dd] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd)).getUTCDay()
}

/** 每日收入／支出（轉帳不算；分帳只算自己的份額；可切刷卡日／扣款日） */
export function useDayTotals(mode: StatMode) {
  const { state } = useStore()
  return useMemo(() => {
    const m = new Map<string, { inc: number; exp: number; txs: Tx[] }>()
    const get = (d: string) => m.get(d) ?? (m.set(d, { inc: 0, exp: 0, txs: [] }), m.get(d)!)
    for (const t of state.txs) {
      const d = t.type === 'expense' && mode === 'cash' ? cashDateOf(t, state.accounts) : t.date
      const b = get(d)
      if (t.type === 'expense') b.exp += myAmount(t)
      else if (t.type === 'income') b.inc += t.amount
      b.txs.push(t)
    }
    return m
  }, [state.txs, state.accounts, mode])
}

export function MonthCalendar({ month, selected, onSelect, days }: {
  month: string
  selected: string
  onSelect: (d: string) => void
  days: Map<string, { inc: number; exp: number; txs: Tx[] }>
}) {
  const { hidden } = useStore()
  const today = todayStr()
  const first = `${month}-01`
  const start = addDays(first, -weekday(first))
  const [y, mo] = month.split('-').map(Number)
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const weeks = Math.ceil((weekday(first) + dim) / 7)
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i))
  const fmt = (n: number) => (hidden ? '••' : compact(n))
  return (
    <div className="cal" role="grid" aria-label={`${month} 月曆`}>
      <div className="cal-wd" role="row">
        {WD.map((w, i) => <span key={w} className={i === 0 || i === 6 ? 'we' : ''} role="columnheader">週{w}</span>)}
      </div>
      <div className="cal-grid">
        {cells.map((d) => {
          const inMonth = d.startsWith(month)
          const v = days.get(d)
          const cls = ['cal-cell', inMonth ? '' : 'out', d === today ? 'today' : '', d === selected ? 'sel' : ''].join(' ')
          return (
            <button key={d} className={cls} onClick={() => onSelect(d)} aria-label={`${d}${v?.inc ? ` 收入 ${v.inc}` : ''}${v?.exp ? ` 支出 ${v.exp}` : ''}`} aria-pressed={d === selected}>
              <span className="cal-day">{Number(d.slice(8))}</span>
              <span className="cal-amts">
                {v && v.inc > 0 && <span className="cal-inc">{fmt(v.inc)}</span>}
                {v && v.exp > 0 && <span className="cal-exp">{fmt(v.exp)}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
