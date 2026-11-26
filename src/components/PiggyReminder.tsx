import { useState } from 'react'
import { useStore } from '../store'
import { budgetStatus, monthStats, thisMonth, todayStr } from '../logic'
import { Money, Sheet } from './ui'

const lastDayOf = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return `${m}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0')}`
}
const STEP = 100
const CELEBRATE = ['🎉', '✨', '💰', '🪙', '🌟']

/** 每月最後一天跳出的「小撲滿存入時間到了」提醒（每天只跳一次，可互動餵小豬） */
export function PiggyReminder() {
  const { state, moveJar } = useStore()
  const month = thisMonth()
  const today = todayStr()
  const seenKey = `piggy-seen-${today}`
  const isLast = today === lastDayOf(month)
  const [open, setOpen] = useState(() => isLast && localStorage.getItem(seenKey) !== '1')
  if (!open) return null
  const close = () => { localStorage.setItem(seenKey, '1'); setOpen(false) }
  const budget = budgetStatus(state, month).total
  const hasBudget = budget.explicit && budget.limit > 0
  const net = monthStats(state, month).net
  const remain = Math.max(0, hasBudget ? budget.limit - budget.spent : net)
  return (
    <PiggyBody
      remain={remain}
      net={net}
      hasBudget={hasBudget}
      jars={state.jars ?? []}
      depositedKey={`surplus-${month}`}
      alreadyDone={(state.jarLog ?? []).some((e) => e.key === `surplus-${month}`)}
      onClose={close}
      onDeposit={(jarId, value) => moveJar(jarId, value, today, '月底結餘', `surplus-${month}`)}
    />
  )
}

function PiggyBody({ remain, net, hasBudget, jars, alreadyDone, onClose, onDeposit }: {
  remain: number; net: number; hasBudget: boolean; jars: { id: string; name: string; emoji: string }[]
  depositedKey: string; alreadyDone: boolean; onClose: () => void; onDeposit: (jarId: string, value: number) => void
}) {
  const [amt, setAmt] = useState(remain)
  const [jarId, setJarId] = useState(jars[0]?.id ?? '')
  const [bump, setBump] = useState(0)
  const [coins, setCoins] = useState<{ id: number; dx: number }[]>([])
  const [done, setDone] = useState(false)
  const feed = () => {
    if (amt >= remain) return
    setAmt((a) => Math.min(remain, a + STEP))
    setBump((b) => b + 1)
    const id = Date.now() + Math.random()
    setCoins((c) => [...c, { id, dx: Math.round(Math.random() * 120 - 60) }])
    window.setTimeout(() => setCoins((c) => c.filter((x) => x.id !== id)), 900)
  }
  const save = () => {
    if (!jarId || amt <= 0) return
    onDeposit(jarId, amt)
    setDone(true)
  }
  const jar = jars.find((j) => j.id === jarId)

  if (done || alreadyDone) {
    return (
      <Sheet open onClose={onClose} title="小豬吃飽了 🐷">
        <div className="piggy-done">
          <div className="confetti" aria-hidden>
            {CELEBRATE.map((c, i) => <span key={i} style={{ animationDelay: `${i * 0.08}s` }}>{c}</span>)}
          </div>
          <p className="strong">今天的結餘已存進 {jar ? `${jar.emoji} ${jar.name}` : '撲滿'} 🎊</p>
          <p className="small muted">離夢想又近一步，下個月繼續加油！</p>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet open onClose={onClose} title="🐷 小撲滿存入時間到了" footer={
      <button className="btn primary" style={{ width: '100%' }} disabled={!jars.length || amt <= 0} onClick={save}>
        {jars.length ? `讓小豬吃下 ${amt.toLocaleString()} 🐷` : '先到資產頁新增撲滿'}
      </button>
    }>
      <div className="piggy-wrap">
        <p className="small muted">今天是月底，來看看這個月還剩多少！</p>
        <div className="piggy-stats">
          <div><span className="muted small">本月結餘</span><Money v={net} sign className={net >= 0 ? 'pos' : 'neg'} /></div>
          {hasBudget && <div><span className="muted small">預算還剩</span><Money v={remain} className="strong pos" /></div>}
        </div>
        <div className="piggy-stage">
          {coins.map((c) => (
            <span key={c.id} className="coin-fly" style={{ ['--dx' as string]: `${c.dx}px` }}>🪙</span>
          ))}
          <button className={`piggy ${bump ? `bump-${bump % 2}` : ''}`} onClick={feed} aria-label="點小豬餵一點錢">🐷</button>
          <p className="small">點小豬 +{STEP} · 目前 <b className="num">{amt.toLocaleString()}</b></p>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(0, remain)}
          step={STEP}
          value={Math.min(amt, remain)}
          onChange={(e) => setAmt(Number(e.target.value))}
          disabled={remain <= 0}
          aria-label="存入金額"
        />
        <div className="piggy-chips">
          <button className="chip" onClick={() => setAmt(remain)} disabled={remain <= 0}>全部</button>
          <button className="chip" onClick={() => setAmt(Math.floor(remain / 2 / STEP) * STEP)} disabled={remain <= 0}>一半</button>
          <button className="chip" onClick={() => setAmt(0)}>不存</button>
        </div>
        {jars.length > 0 && (
          <div className="piggy-jars">
            <span className="small muted">存進哪個撲滿</span>
            <div className="piggy-chips">
              {jars.map((j) => (
                <button key={j.id} className={`chip ${jarId === j.id ? 'on' : ''}`} onClick={() => setJarId(j.id)}>{j.emoji} {j.name}</button>
              ))}
            </div>
          </div>
        )}
        {remain <= 0 && <p className="small muted">這個月沒有剩餘可以存，下個月再加油 💪</p>}
      </div>
    </Sheet>
  )
}
