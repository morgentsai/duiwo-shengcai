import type { ReactNode } from 'react'
import type { Account, Tx } from '../types'
import { useStore } from '../store'
import { GroupCard } from '../components/Budget'
import { useState } from 'react'
import { cashWallet, cashWithdrawn, dueCards, money, etfInvested, monthLabel, monthStats, thisMonth, totals } from '../logic'
import { Money, Progress } from '../components/ui'
import { PiggyReminder } from '../components/PiggyReminder'
import { CollectSheet } from '../components/Collect'
import { SurplusCard } from '../components/Jars'
import { IconArrow, IconCheck, IconChevron, IconStar } from '../components/icons'

function findAcc(accs: Account[], id: string, tag?: string) {
  return accs.find((a) => a.id === id) ?? (tag ? accs.find((a) => a.tag === tag) : undefined)
}

function StepNode({ n, title, desc, children, done, accent }: { n: number; title: string; desc: ReactNode; children?: ReactNode; done: boolean; accent?: string }) {
  return (
    <div className={`step ${done ? 'done' : ''}`}>
      <div className="step-rail">
        <span className="step-n" style={accent && !done ? { background: accent } : undefined}>{done ? <IconCheck size={13} /> : n}</span>
      </div>
      <div className="step-body">
        <div className="step-title">{title}</div>
        <div className="step-desc">{desc}</div>
        {children}
      </div>
    </div>
  )
}

function Route({ from, to }: { from?: Account; to?: Account }) {
  return (
    <span className="route">
      {from?.name ?? '—'} <IconArrow /> {to?.name ?? '—'}
    </span>
  )
}

export function Overview({ goTab }: { onOpenTx: (t: Tx) => void; goTab: (t: 'tx' | 'assets' | 'analytics') => void }) {
  const { state, runFlow, resetFlow, flash, autopay, hidden } = useStore()
  const T = totals(state)
  const month = thisMonth()
  const st = monthStats(state, month)
  const accs = state.accounts
  const salary = findAcc(accs, 'mega', '薪資帳戶')
  const hub = findAcc(accs, 'richart', '中繼帳戶 A')
  const cash = cashWallet(accs)
  const cards = accs.filter((a) => a.kind === 'card')
  const etfBroker = accs.find((a) => a.kind === 'broker' && (a.monthlyTarget ?? 0) > 0)
  const etfTarget = etfBroker?.monthlyTarget ?? 15000
  const cashTarget = cash?.cashTarget ?? 5000

  const ids = new Set(state.txs.map((t) => t.id))
  const isDone = (k: string) => (state.flow.done[k] ?? []).some((id) => ids.has(id))

  const pool = cards.reduce((x, c) => x + (c.billed ?? 0), 0)
  const groups = new Map<string, Account[]>()
  for (const c of cards) {
    const k = c.payAccountId ?? ''
    groups.set(k, [...(groups.get(k) ?? []), c])
  }
  const dist = [...groups.entries()].map(([accId, cs]) => {
    const acc = accs.find((a) => a.id === accId)
    const need = cs.reduce((x, c) => x + (c.billed ?? 0), 0)
    const bal = acc?.balance ?? 0
    return { key: `dist-${accId}`, acc, cards: cs, need, bal, short: Math.max(0, need - bal), isHub: accId === hub?.id }
  })

  const steps = ['pool', ...dist.filter((d) => !d.isHub).map((d) => d.key), 'cash-in', 'cash-out', 'etf']
  const doneCount = steps.filter((k) => isDone(k) || (k.startsWith('dist-') && dist.find((d) => d.key === k)?.short === 0)).length

  const exec = (key: string, items: Omit<Tx, 'id' | 'date'>[], msg: string) => {
    const from = accs.find((a) => a.id === items[0]?.fromId)
    if (from && from.kind !== 'cash' && from.balance < items[0].amount && !window.confirm(`${from.name} 目前餘額不足以轉出，仍要記錄這筆轉帳嗎？`)) return
    const g = key === 'pool' || key.startsWith('dist-') ? ['cardflow', '卡費分流'] : key.startsWith('cash') ? ['cash', '生活費領現'] : ['etf', 'ETF 定期投入']
    runFlow(key, items, { id: `${g[0]}-${month}`, title: `${Number(month.slice(5))} 月${g[1]}` })
    flash(msg)
  }

  const withdrawn = cashWithdrawn(state, month)
  const etfDone = etfInvested(state, month)
  const due = dueCards(state)
  const dueTotal = due.reduce((x, d) => x + (d.card.billed ?? 0), 0)
  const [collectOpen, setCollectOpen] = useState(false)
  /** 發薪日流程：未完成時預設展開，全部完成後預設收合 */
  const [flowOpen, setFlowOpen] = useState<boolean | null>(null)
  const showFlow = flowOpen ?? doneCount < steps.length

  return (
    <div className="page">
      <PiggyReminder />
      <SurplusCard />
      {due.length > 0 && (
        <section className="card alert">
          <div className="alert-icon">💳</div>
          <div className="row-main">
            <span className="strong">
              {due.some((d) => d.today) ? '今天有' : '已到扣款日：'}
              {due.map((d) => d.card.name).join('、')} 自動扣繳 <Money v={dueTotal} />
            </span>
            <span className="row-sub">
              {due.map((d) => `${d.card.name} 每月 ${d.card.dueDay} 日從${accs.find((a) => a.id === d.card.payAccountId)?.name ?? '—'}扣款`).join('；')}
            </span>
          </div>
          <button
            className="btn small primary"
            onClick={() => {
              const amt = autopay(due.map((d) => d.card.id))
              flash(`已完成自動扣繳 ${money(amt, hidden)}`)
            }}
          >
            一鍵完成
          </button>
        </section>
      )}
      {/* 淨資產 */}
      <section className="card hero">
        <div className="hero-label">總淨資產</div>
        <Money v={T.net} className="hero-num" />
        {T.fx !== 0 && (
          <div className="hero-note">其中外幣存款約當 <Money v={T.fx} /></div>
        )}
        <div className="hero-split">
          <button onClick={() => goTab('assets')}>
            <span className="k"><i className="dot" style={{ background: '#0A84FF' }} />銀行與現金</span>
            <Money v={T.liquid} />
          </button>
          <button onClick={() => goTab('assets')}>
            <span className="k"><i className="dot" style={{ background: '#34C759' }} />投資市值</span>
            <Money v={T.invest} />
          </button>
          <button onClick={() => setCollectOpen(true)}>
            <span className="k"><i className="dot" style={{ background: '#AF52DE' }} />待收代墊</span>
            <Money v={T.receivable} />
          </button>
          <button onClick={() => goTab('assets')}>
            <span className="k"><i className="dot" style={{ background: '#FF3B30' }} />信用卡與負債</span>
            <Money v={-T.debt} />
          </button>
        </div>
      </section>

      {/* 發薪日資金分流（全部完成後收合） */}
      <section className="card">
        <button className="fold-head" onClick={() => setFlowOpen(!showFlow)} aria-expanded={showFlow}>
          <span>
            <h2>發薪日資金分流</h2>
            <span className="muted small">{monthLabel(month)} · 已完成 {doneCount}/{steps.length} 步</span>
          </span>
          <span className={`chev ${showFlow ? 'open' : ''}`}><IconChevron size={16} /></span>
        </button>
        {showFlow && (
          <>
            <div className="flow-tools">
              <button
                className="btn small ghost"
                onClick={() => {
                  if (window.confirm('重置本月流程？\n\n會撤銷本月由「執行轉帳」產生的紀錄，並把帳戶餘額還原。')) {
                    resetFlow(true)
                    flash('已重置本月流程')
                  }
                }}
              >
                重置
              </button>
            </div>
            <Progress value={doneCount} max={steps.length} tone="green" />

        <div className="steps">
          <StepNode n={1} title="卡費總池" done={isDone('pool')} desc={<><Route from={salary} to={hub} /> · 5 張卡本期應繳合計</>}>
            <div className="step-line">
              <Money v={pool} className="strong" />
              {isDone('pool') ? (
                <span className="pill green">已完成</span>
              ) : (
                <button className="btn small primary" disabled={!pool || !salary || !hub} onClick={() => exec('pool', [{ type: 'transfer', amount: pool, fromId: salary?.id, toId: hub?.id, note: '卡費總池', tag: 'payday', category: '一般轉帳' }], '已轉入卡費總池')}>
                  執行轉帳
                </button>
              )}
            </div>
          </StepNode>

          <StepNode n={2} title="分撥各扣繳帳戶" done={dist.every((d) => d.isHub || d.short === 0 || isDone(d.key))} desc={<>從 {hub?.name ?? 'Richart'} 補足各卡自動扣繳銀行</>}>
            <div className="dist">
              {dist.map((d) => {
                const done = isDone(d.key)
                return (
                  <div key={d.key} className="dist-row">
                    <div className="dist-top">
                      <span className="dist-name">{d.acc?.name ?? '未綁定帳戶'}</span>
                      <span className="dist-cards">
                        {d.cards.map((c) => (
                          <span key={c.id} className="mini-tag">{c.primary && <IconStar />}{c.name}</span>
                        ))}
                      </span>
                    </div>
                    <div className="dist-grid">
                      <span>目前餘額<Money v={d.bal} /></span>
                      <span>本期應繳<Money v={d.need} /></span>
                      <span>還差<Money v={d.short} className={d.short ? 'warn' : ''} /></span>
                    </div>
                    <div className="dist-act">
                      {done ? (
                        <span className="pill green">已補轉完成</span>
                      ) : d.short === 0 ? (
                        <span className="pill green">已備足</span>
                      ) : d.isHub ? (
                        <span className="pill orange">需補轉 <Money v={d.short} /> · 完成步驟 1 後即備足</span>
                      ) : (
                        <>
                          <span className="pill orange">需補轉 <Money v={d.short} /></span>
                          <button className="btn small primary" disabled={!hub} onClick={() => exec(d.key, [{ type: 'transfer', amount: d.short, fromId: hub?.id, toId: d.acc?.id, note: `補足 ${d.cards.map((c) => c.name).join('、')} 扣繳`, tag: 'payday', category: '一般轉帳' }], `已補轉到 ${d.acc?.name}`)}>
                            執行轉帳
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </StepNode>

          <StepNode n={3} title="生活費現金" done={isDone('cash-in') && isDone('cash-out')} desc={<><Route from={salary} to={hub} /> → ATM 領現</>}>
            <div className="step-line">
              <span className="muted small">3a 轉入 {hub?.name}</span>
              {isDone('cash-in') ? <span className="pill green">已完成</span> : (
                <button className="btn small primary" onClick={() => exec('cash-in', [{ type: 'transfer', amount: cashTarget, fromId: salary?.id, toId: hub?.id, note: '生活費現金', tag: 'payday', category: '一般轉帳' }], '生活費已轉入 Richart')}>
                  執行轉帳 <Money v={cashTarget} />
                </button>
              )}
            </div>
            <div className="step-line">
              <span className="muted small">3b ATM 領現到現金錢包</span>
              {isDone('cash-out') ? <span className="pill green">已完成</span> : (
                <button className="btn small primary" onClick={() => exec('cash-out', [{ type: 'transfer', amount: cashTarget, fromId: hub?.id, toId: cash?.id, note: 'ATM 領現', tag: 'withdraw', category: '領現' }], '已領現，現金錢包已更新')}>
                  領現 <Money v={cashTarget} />
                </button>
              )}
            </div>
          </StepNode>

          <StepNode n={4} title="固定 ETF 投資" done={isDone('etf')} desc={<><Route from={salary} to={etfBroker} />（交割戶，記為投入本金）</>}>
            <div className="step-line">
              <Money v={etfTarget} className="strong" />
              {isDone('etf') ? <span className="pill green">已完成</span> : (
                <button className="btn small primary" disabled={!etfBroker} onClick={() => exec('etf', [{ type: 'transfer', amount: etfTarget, fromId: salary?.id, toId: etfBroker?.id, note: '固定 ETF 投資', tag: 'etf', category: '投資', sub: '投入' }], '已投入本金，成交後到「資產 → 證券」記買進')}>
                  執行轉帳
                </button>
              )}
            </div>
          </StepNode>
        </div>
          </>
        )}
      </section>

        <section className="card">
          <div className="card-head">
            <h2>本月概況</h2>
            <button className="link" onClick={() => goTab('analytics')}>分析 <IconChevron size={14} /></button>
          </div>
          <div className="io">
            <div><span className="muted small">收入</span><Money v={st.income} className="pos strong" /></div>
            <div><span className="muted small">支出</span><Money v={st.expense} className="strong" /></div>
            <div><span className="muted small">結餘</span><Money v={st.net} className={`strong ${st.net < 0 ? 'neg' : ''}`} /></div>
          </div>
          <div className="month-cash">
            <div className="row-split">
              <span className="muted small">本月已領現 <Money v={withdrawn} /> / <Money v={cashTarget} /></span>
              <span className="muted small">錢包 <Money v={cash?.balance ?? 0} /></span>
            </div>
            <Progress value={withdrawn} max={cashTarget} />
            <div className="row-split">
              <span className="muted small">本月 ETF 投入</span>
              <span><Money v={etfDone} /> <span className="muted small">/ <Money v={etfTarget} /></span></span>
            </div>
          </div>
        </section>

      <GroupCard />

      {collectOpen && <CollectSheet onClose={() => setCollectOpen(false)} />}

    </div>
  )
}
