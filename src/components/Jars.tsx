import { useState } from 'react'
import type { Jar } from '../types'
import { expenseCats } from '../types'
import { budgetStatus, resolvePrefs, thisMonth, todayStr } from '../logic'
import { useStore } from '../store'
import { Field, Money, Progress, Sheet } from './ui'

const toNum = (v: string) => Math.max(0, Math.round(Number(v) || 0))

/* ---------- 月底結餘 → 撲滿（總覽上的精簡列） ---------- */
export function SurplusCard() {
  const { state, moveJar } = useStore()
  const month = thisMonth()
  const total = budgetStatus(state, month).total
  const key = `surplus-${month}`
  const done = (state.jarLog ?? []).find((e) => e.key === key)
  const jars = state.jars ?? []
  const [open, setOpen] = useState(false)
  if (!total.explicit || total.limit <= 0) return null
  const remain = total.limit - total.spent

  return (
    <>
      <section className="card slim">
        <div className="slim-row">
          {remain > 0 ? (
            <span className="small">本月還剩 <Money v={remain} className="strong" /></span>
          ) : (
            <span className="small muted">本月已超出上限，下個月再加油</span>
          )}
          {remain > 0 && done && <span className="pill green">已存入撲滿 ✓</span>}
          {remain > 0 && !done && jars.length > 0 && (
            <button className="btn small primary" onClick={() => setOpen(true)}>存入撲滿</button>
          )}
        </div>
        {remain > 0 && !done && jars.length === 0 && <p className="tiny muted">到「資產」頁新增撲滿，就能把剩下的錢存進去。</p>}
      </section>
      {open && (
        <SurplusSheet
          remain={remain}
          jars={jars}
          onClose={() => setOpen(false)}
          onDeposit={(jarId, value) => moveJar(jarId, value, todayStr(), '月底結餘', key)}
        />
      )}
    </>
  )
}

function SurplusSheet({ remain, jars, onClose, onDeposit }: { remain: number; jars: Jar[]; onClose: () => void; onDeposit: (jarId: string, value: number) => void }) {
  const [jarId, setJarId] = useState(jars[0]?.id ?? '')
  const [amt, setAmt] = useState(String(remain))
  const value = toNum(amt)
  const jar = jars.find((j) => j.id === jarId)
  const valid = !!jar && value > 0 && value <= remain
  return (
    <Sheet
      open
      onClose={onClose}
      title="存入撲滿"
      footer={
        <button
          className="btn primary"
          style={{ width: '100%' }}
          disabled={!valid}
          onClick={() => { if (jar) { onDeposit(jar.id, value); onClose() } }}
        >
          存入
        </button>
      }
    >
      <div className="form-stack">
        <p className="small muted">把本月剩下的錢存進撲滿，離目標又近一步。</p>
        <Field label="存入哪個撲滿">
          <select value={jarId} onChange={(e) => setJarId(e.target.value)}>
            {jars.map((j) => <option key={j.id} value={j.id}>{j.emoji} {j.name}</option>)}
          </select>
        </Field>
        <Field label="金額" hint={`最多 ${remain.toLocaleString()}`}>
          <input type="number" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} />
        </Field>
      </div>
    </Sheet>
  )
}

/* ---------- 撲滿列表 ---------- */
export function JarsCard() {
  const { state, addJar, deleteJar } = useStore()
  const [adding, setAdding] = useState(false)
  const [act, setAct] = useState<{ jar: Jar; mode: 'in' | 'out' } | null>(null)
  const jars = state.jars ?? []
  const nameOf = (id: string) => jars.find((j) => j.id === id)?.name ?? '撲滿'
  const recent = (state.jarLog ?? []).slice(0, 5)

  return (
    <section className="card half">
      <div className="card-head">
        <h2>🐷 撲滿</h2>
        <button className="btn small ghost" onClick={() => setAdding(true)}>＋ 新增</button>
      </div>
      {jars.length === 0 ? (
        <p className="empty">還沒有撲滿。例如「旅遊基金」或「想買的東西」，把錢先預留在這裡，喜歡的東西就從這裡出。</p>
      ) : (
        jars.map((j) => (
          <div key={j.id} className="jar">
            <div className="row-split">
              <span className="strong">
                {j.emoji} {j.name}
                {j.target && j.balance >= j.target && <span className="pill green" style={{ marginLeft: 6 }}>🎉 達標</span>}
              </span>
              <Money v={j.balance} />
            </div>
            {j.target ? (
              <>
                <Progress value={j.balance} max={j.target} tone="green" />
                <div className="small muted">目標 <Money v={j.target} />・還差 <Money v={Math.max(0, j.target - j.balance)} /></div>
              </>
            ) : null}
            <div className="jar-actions">
              <button className="btn small primary" onClick={() => setAct({ jar: j, mode: 'in' })}>存入</button>
              <button className="btn small ghost" disabled={j.balance <= 0} onClick={() => setAct({ jar: j, mode: 'out' })}>取出花掉</button>
              <button className="btn small ghost" onClick={() => deleteJar(j.id)}>刪除</button>
            </div>
          </div>
        ))
      )}
      {recent.length > 0 && (
        <div className="jar-log">
          <div className="small muted">最近紀錄</div>
          {recent.map((e) => (
            <div key={e.id} className="row-split small">
              <span>{e.date.slice(5)} {nameOf(e.jarId)}・{e.note}</span>
              <span className={e.amount > 0 ? 'pos' : 'neg'}>{e.amount > 0 ? '+' : ''}<Money v={e.amount} /></span>
            </div>
          ))}
        </div>
      )}

      <AddJarSheet open={adding} onClose={() => setAdding(false)} onAdd={addJar} />
      {act && <JarMoveSheet jar={act.jar} mode={act.mode} onClose={() => setAct(null)} />}
    </section>
  )
}

function AddJarSheet({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (j: { name: string; emoji: string; target?: number }) => void }) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🐷')
  const [target, setTarget] = useState('')
  const ok = name.trim().length > 0
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="新增撲滿"
      footer={
        <button
          className="btn primary"
          style={{ width: '100%' }}
          disabled={!ok}
          onClick={() => { onAdd({ name: name.trim(), emoji: emoji.trim() || '🐷', target: toNum(target) || undefined }); setName(''); setTarget(''); onClose() }}
        >
          建立
        </button>
      }
    >
      <div className="form-stack">
        <Field label="名稱"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：旅遊基金" /></Field>
        <Field label="圖示"><input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} /></Field>
        <Field label="目標金額（選填）" hint="設定後會顯示進度，達標會有提示">
          <input type="number" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="例如 50000" />
        </Field>
      </div>
    </Sheet>
  )
}

function JarMoveSheet({ jar, mode, onClose }: { jar: Jar; mode: 'in' | 'out'; onClose: () => void }) {
  const { state, moveJar, addTx } = useStore()
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayStr())
  const [note, setNote] = useState('')
  const [category, setCategory] = useState('')
  const [fromId, setFromId] = useState(resolvePrefs(state).payId)
  const cats = expenseCats(state.catExtra, state.catList)
  const accounts = state.accounts.filter((a) => a.kind !== 'loan' && a.kind !== 'broker')
  const value = toNum(amount)
  const valid = value > 0 && (mode === 'in' || (value <= jar.balance && !!category && !!fromId))

  const submit = () => {
    if (!valid) return
    if (mode === 'in') {
      moveJar(jar.id, value, date, note.trim() || '存入')
    } else {
      addTx({ type: 'expense', date, amount: value, category, fromId, note: `撲滿：${jar.name}${note.trim() ? `・${note.trim()}` : ''}` })
      moveJar(jar.id, -value, date, note.trim() || '取出花掉')
    }
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={mode === 'in' ? `存入「${jar.name}」` : `從「${jar.name}」取出花掉`}
      footer={<button className="btn primary" style={{ width: '100%' }} disabled={!valid} onClick={submit}>{mode === 'in' ? '存入' : '記為支出'}</button>}
    >
      <div className="form-stack">
        <Field label="金額" hint={mode === 'out' ? `目前餘額 ${jar.balance.toLocaleString()}` : undefined}>
          <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {mode === 'out' && (
          <>
            <Field label="分類">
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">請選擇</option>
                {cats.map((c) => <option key={c.key} value={c.key}>{c.emoji} {c.key}</option>)}
              </select>
            </Field>
            <Field label="從哪個帳戶付">
              <select value={fromId} onChange={(e) => setFromId(e.target.value)}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label="日期"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="備註（選填）"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === 'in' ? '例如：11 月結餘' : '例如：機票'} /></Field>
      </div>
    </Sheet>
  )
}
