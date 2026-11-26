import { useState } from 'react'
import { incomeEstimate, money } from '../logic'
import { useStore } from '../store'
import { Field } from './ui'

const toNum = (v: string) => Math.max(0, Math.round(Number(v) || 0))

/** 收入分配（50／30／20）：只是設定，用來換算三大類每月預算與儲蓄目標，不在總覽顯示 */
export function AllocationSettings() {
  const { state, setBudgetCfg, flash } = useStore()
  const cfg = state.budgetCfg ?? {}
  const est = incomeEstimate(state)
  const saved = cfg.ratio ?? { needs: 50, wants: 30, savings: 20 }
  const [needs, setNeeds] = useState(String(saved.needs))
  const [wants, setWants] = useState(String(saved.wants))
  const [savings, setSavings] = useState(String(saved.savings))
  const [income, setIncome] = useState(cfg.incomeEst ? String(cfg.incomeEst) : '')

  const n = toNum(needs)
  const w = toNum(wants)
  const s = toNum(savings)
  const ok = n + w + s === 100
  const inc = toNum(income) || est.value

  const save = () => {
    if (!ok) return
    setBudgetCfg({ ...cfg, ratio: { needs: n, wants: w, savings: s }, incomeEst: toNum(income) || undefined })
    flash('已儲存收入分配比例')
  }
  const apply = () => {
    if (!ok) return
    setBudgetCfg({
      ...cfg,
      ratio: { needs: n, wants: w, savings: s },
      incomeEst: toNum(income) || undefined,
      groups: {
        ...(cfg.groups ?? {}),
        fixed: Math.round((inc * n) / 100),
        variable: Math.round((inc * w) / 100),
        saving: Math.round((inc * s) / 100),
      },
    })
    flash('已套用到三大類預算')
  }

  return (
    <section className="card">
      <div className="card-head"><h2>收入分配</h2></div>
      <p className="small muted">依收入比例，自動換算三大類的每月預算與儲蓄目標。</p>
      <div className="form-stack">
        <Field label="每月收入" hint={`留空則使用預估值 ${money(est.value)}（${est.basis}）`}>
          <input type="number" inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value)} placeholder={String(est.value)} />
        </Field>
        <div className="alloc-grid">
          <Field label="必要生活 %" hint={money(Math.round((inc * n) / 100))}><input type="number" inputMode="numeric" value={needs} onChange={(e) => setNeeds(e.target.value)} /></Field>
          <Field label="想要的生活 %" hint={money(Math.round((inc * w) / 100))}><input type="number" inputMode="numeric" value={wants} onChange={(e) => setWants(e.target.value)} /></Field>
          <Field label="未來目標 %" hint={money(Math.round((inc * s) / 100))}><input type="number" inputMode="numeric" value={savings} onChange={(e) => setSavings(e.target.value)} /></Field>
        </div>
        <p className={`tiny ${ok ? 'muted' : 'neg'}`}>合計 {n + w + s}%{ok ? '' : '，需為 100%'}</p>
        <div className="jar-actions">
          <button className="btn small primary" disabled={!ok} onClick={apply}>套用到三大類預算</button>
          <button className="btn small ghost" disabled={!ok} onClick={save}>只儲存比例</button>
        </div>
      </div>
    </section>
  )
}
