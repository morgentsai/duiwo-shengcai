import { useState } from 'react'
import type { Tx } from '../types'
import { catMeta } from '../types'
import { useStore } from '../store'
import { byId, txAccountsLabel } from '../logic'
import { Money } from './ui'
import { IconChevron } from './icons'

function txIcon(t: Tx, toKind?: string) {
  if (t.trade) return t.trade.kind === 'dividend' ? '💹' : t.trade.kind === 'buy' ? '📈' : '📉'
  if (t.tag === 'collect') return '🤝'
  if (t.type === 'expense' || t.type === 'income') return catMeta(t.category).emoji
  if (t.tag === 'withdraw') return '🏧'
  if (toKind === 'card') return '💳'
  if (t.tag === 'etf') return '📈'
  return '🔁'
}

export function TxRow({ t, onClick, showDate, nested }: { t: Tx; onClick?: () => void; showDate?: boolean; nested?: boolean }) {
  const { state } = useStore()
  const meta = catMeta(t.category)
  const to = byId(state, t.toId)
  const icon = txIcon(t, to?.kind)
  const title =
    t.note || t.sub || (t.type === 'transfer' ? (t.tag === 'withdraw' ? 'ATM 領現' : to?.kind === 'card' ? '繳卡費' : t.category ?? '轉帳') : t.category ?? '')
  const catLabel = t.type === 'transfer' ? t.category ?? (t.tag === 'etf' ? '投資' : '轉帳') : t.category
  const sub = [[catLabel, t.sub].filter(Boolean).join('・'), txAccountsLabel(state, t), showDate ? t.date.slice(5).replace('-', '/') : '']
    .filter(Boolean)
    .join(' · ')
  const shown = t.type === 'expense' ? -(t.share ? t.share.mine : t.amount) : t.amount
  return (
    <button className={`row tx-row ${nested ? 'nested' : ''}`} onClick={onClick}>
      <span className="tx-icon" style={{ background: t.type === 'expense' ? `${meta.color}1F` : t.type === 'income' ? '#34C7591F' : '#8E8E931A' }}>{icon}</span>
      <span className="row-main">
        <span className="row-title">
          {title}
          {t.share && <span className="proj-tag share">🤝 分帳</span>}
          {t.project && <span className="proj-tag">🏷️ {t.project}</span>}
        </span>
        <span className="row-sub">{sub}</span>
      </span>
      <span className="hold-r">
        <Money v={shown} sign={t.type === 'income'} className={`row-amt ${t.type === 'income' ? 'pos' : t.type === 'transfer' ? 'muted' : ''}`} />
        {t.share && <span className="muted tiny">總額 <Money v={t.amount} /></span>}
      </span>
    </button>
  )
}

/** 折疊的轉帳群組：一行顯示合計，點開看每一筆 */
export function TxGroupRow({ title, txs, onOpenTx }: { title: string; txs: Tx[]; onOpenTx: (t: Tx) => void }) {
  const [open, setOpen] = useState(false)
  const total = txs.filter((t) => !t.trade).reduce((x, t) => x + t.amount, 0)
  const icon = txs.some((t) => t.tag === 'cardpay') ? '💳' : txs.some((t) => t.tag === 'etf' || t.trade) ? '📈' : txs.some((t) => t.tag === 'withdraw') ? '🏧' : '🔀'
  return (
    <>
      <button className="row tx-row group-row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="tx-icon" style={{ background: '#0A84FF14' }}>{icon}</span>
        <span className="row-main">
          <span className="row-title">{title}</span>
          <span className="row-sub">內部轉帳 · {txs.length} 筆 · 不計入收支</span>
        </span>
        <Money v={total} className="row-amt muted" />
        <IconChevron className={`chev ${open ? 'rot' : ''}`} />
      </button>
      {open && txs.map((t) => <TxRow key={t.id} t={t} nested showDate onClick={() => onOpenTx(t)} />)}
    </>
  )
}
