import { useState } from 'react'
import { useStore } from '../store'
import { cashWallet, friendsOwed, money, todayStr } from '../logic'
import { Sheet } from './ui'

/** 收回代墊：選擇待收項目與入帳帳戶，沖銷應收（不算收入） */
export function CollectSheet({ onClose, friend }: { onClose: () => void; friend?: string }) {
  const { state, collect, flash, hidden } = useStore()
  const owed = friendsOwed(state)
  const [sel, setSel] = useState<Set<string>>(() => new Set(owed.filter((f) => !friend || f.friend === friend).flatMap((f) => f.items.map((r) => r.id))))
  const lp = state.accounts.find((a) => a.id === 'linepay-money') ?? cashWallet(state.accounts)
  const [toId, setToId] = useState(lp?.id ?? 'mega')
  const [date, setDate] = useState(todayStr())
  const total = owed.flatMap((f) => f.items).filter((r) => sel.has(r.id)).reduce((x, r) => x + r.amount, 0)
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleFriend = (ids: string[]) => setSel((s) => { const n = new Set(s); const all = ids.every((i) => n.has(i)); ids.forEach((i) => (all ? n.delete(i) : n.add(i))); return n })
  const accounts = state.accounts.filter((a) => a.kind === 'bank' || a.kind === 'cash')
  return (
    <Sheet
      open
      onClose={onClose}
      title="收回代墊"
      footer={
        <button
          className="btn primary grow"
          style={{ width: '100%' }}
          disabled={!total}
          onClick={() => {
            const amt = collect([...sel], toId, date)
            flash(`已收回 ${money(amt, hidden)}，待收已沖銷`)
            onClose()
          }}
        >
          收回 {money(total, hidden)}
        </button>
      }
    >
      {owed.length === 0 && <p className="empty">目前沒有待收代墊</p>}
      {owed.map((f) => (
        <div key={f.friend} className="collect-group">
          <button type="button" className="collect-friend" onClick={() => toggleFriend(f.items.map((r) => r.id))}>
            <span className="avatar">{f.friend.slice(0, 1)}</span>
            <span className="strong">{f.friend}</span>
            <span className="num muted">{money(f.amount, hidden)}</span>
          </button>
          {f.items.map((r) => (
            <label key={r.id} className="collect-item">
              <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
              <span className="row-main">
                <span>{r.note || '代墊'}</span>
                <span className="row-sub">{r.date.replace(/-/g, '/')}</span>
              </span>
              <span className="num">{money(r.amount, hidden)}</span>
            </label>
          ))}
        </div>
      ))}
      <div className="two-col">
        <label className="field">
          <span className="field-label">入帳帳戶</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="field-label">日期</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <p className="hint">收回代墊只會把「待收」轉成帳戶餘額，不算收入，也不會影響當月餐費。</p>
    </Sheet>
  )
}
