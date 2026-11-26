import { useState } from 'react'
import { useStore } from '../store'
import { money } from '../logic'
import type { Recur } from '../types'

const FREQ_LABEL: Record<Recur['freq'], string> = { week: '每週', month: '每月', year: '每年' }

/** 週期性支出規則列表：可看到下次日期並刪除（兩次點擊確認，沙盒內 confirm 不可用） */
export function RecurSettings() {
  const { state, removeRecur, hidden } = useStore()
  const [armed, setArmed] = useState<string | null>(null)
  const rules = state.recurs ?? []
  if (!rules.length) {
    return (
      <div className="card">
        <p className="muted">還沒有週期性支出。在「新增記帳」選擇支出後，把「次數」改成每週、每月或每年即可。</p>
      </div>
    )
  }
  return (
    <div className="set-group">
      {rules.map((r) => {
        const name = `${r.tpl.sub ?? r.tpl.category ?? '支出'}${r.tpl.note ? `・${r.tpl.note}` : ''}`
        const acc = state.accounts.find((a) => a.id === r.tpl.fromId)?.name ?? '—'
        return (
          <div className="set-row recur-row" key={r.id}>
            <span className="set-icon" style={{ background: '#FF9F0A' }}>🔁</span>
            <span className="set-title">
              {name}
              <span className="small muted" style={{ display: "block" }}>{FREQ_LABEL[r.freq]}・{acc}・從 {r.start} 起{r.lastRun ? `・上次 ${r.lastRun}` : ''}</span>
            </span>
            <span className="set-detail num">{money(r.tpl.amount, hidden)}</span>
            <button
              className={`btn small ${armed === r.id ? "danger" : "ghost"}`}
              onClick={() => (armed === r.id ? removeRecur(r.id) : setArmed(r.id))}
            >
              {armed === r.id ? '再按一次刪除' : '刪除'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
