import { useState } from 'react'
import type { Account, AccountKind, Holding } from '../types'
import { FX_CURRENCIES, isFx } from '../types'
import { useStore } from '../store'
import { brokerStats, cardDebt, etfInvested, money, pct, thisMonth, totals, uid } from '../logic'
import { InvestStatGrid, StatementSheet, TradeSheet } from '../components/Invest'
import type { TradeKind } from '../components/Invest'
import { InvestChart } from '../components/charts'
import { BankBadge, Field, Money, Progress, Segmented, Sheet } from '../components/ui'
import { IconChevron, IconStar } from '../components/icons'

type Sec = 'bank' | 'card' | 'invest'
const COLORS = ['#0A84FF', '#34C759', '#FF9F0A', '#FF3B30', '#BF5AF2', '#5E5CE6', '#30B0C7', '#A2845E', '#8E8E93']

export function Assets() {
  const { state, autopay: doAutopay, cardStatement, flash, hidden } = useStore()
  const [sec, setSec] = useState<Sec>('bank')
  const [editAcc, setEditAcc] = useState<Account | null>(null)
  const [editHold, setEditHold] = useState<Holding | null>(null)
  const [batch, setBatch] = useState(false)
  const T = totals(state)
  const accs = state.accounts
  const banks = accs.filter((a) => a.kind === 'bank' || a.kind === 'cash')
  const cards = accs.filter((a) => a.kind === 'card')
  const loans = accs.filter((a) => a.kind === 'loan')
  const brokers = accs.filter((a) => a.kind === 'broker')

  const newAcc = (kind: AccountKind): Account => ({
    id: uid(), name: '', kind, balance: 0, color: COLORS[accs.length % COLORS.length],
    ...(kind === 'card' ? { payAccountId: banks[0]?.id, statementDay: 5, dueDay: 20, billed: 0, unbilled: 0, primary: false } : {}),
  })

  const autopay = (c: Account) => {
    const pay = accs.find((a) => a.id === c.payAccountId)
    const amt = c.billed ?? 0
    if (!pay) return flash('請先綁定扣繳銀行')
    if (!amt) return flash('本期沒有應繳金額')
    if (pay.balance < amt && !window.confirm(`${pay.name} 餘額不足（差 ${money(amt - pay.balance)}），仍要記錄扣繳？`)) return
    doAutopay([c.id])
    flash(`${c.name} 已扣繳 ${money(amt, hidden)}`)
  }
  const [stmtCard, setStmtCard] = useState<Account | null>(null)
  const [trade, setTrade] = useState<{ broker: Account; kind: TradeKind } | null>(null)
  const inv = brokerStats(state)

  return (
    <div className="page">
      <section className="card summary-strip">
        <div><span className="muted small">銀行與現金</span><Money v={T.liquid} className="strong" /></div>
        <div><span className="muted small">投資市值</span><Money v={T.invest} className="strong pos" /></div>
        <div><span className="muted small">信用卡與負債</span><Money v={-T.debt} className="strong neg" /></div>
      </section>

      <Segmented<Sec>
        value={sec}
        onChange={setSec}
        options={[
          { value: 'bank', label: '銀行與現金' },
          { value: 'card', label: '信用卡' },
          { value: 'invest', label: '證券與 ETF' },
        ]}
      />

      {sec === 'bank' && (
        <>
          <section className="card list-card">
            <div className="card-head pad"><h2>台幣帳戶與現金</h2><Money v={T.twd} className="strong" /></div>
            {banks.filter((a) => !isFx(a)).map((a) => <BankRow key={a.id} a={a} onClick={() => setEditAcc(a)} />)}
            <div className="list-actions">
              <button className="btn ghost small" onClick={() => setEditAcc(newAcc('bank'))}>＋ 新增銀行帳戶</button>
              <button className="btn ghost small" onClick={() => setEditAcc(newAcc('loan'))}>＋ 新增負債／貸款</button>
            </div>
          </section>
          <section className="card list-card">
            <div className="card-head pad"><h2>外幣存款</h2><span><span className="muted small">約當 </span><Money v={T.fx} className="strong" /></span></div>
            {banks.filter(isFx).map((a) => <BankRow key={a.id} a={a} onClick={() => setEditAcc(a)} />)}
            <div className="list-actions">
              <button className="btn ghost small" onClick={() => setEditAcc({ ...newAcc('bank'), currency: 'USD', fxBalance: 0, fxRate: 32, tag: '外幣存款' })}>＋ 新增外幣帳戶</button>
            </div>
          </section>
        </>
      )}

      {sec === 'card' && (
        <>
          {cards.map((c) => {
            const pay = accs.find((a) => a.id === c.payAccountId)
            const sameNeed = cards.filter((x) => x.payAccountId === c.payAccountId).reduce((x, y) => x + (y.billed ?? 0), 0)
            const ok = (pay?.balance ?? 0) >= sameNeed
            const status = !c.billed ? 'gray' : ok ? 'green' : 'orange'
            return (
              <section key={c.id} className="card credit">
                <div className="credit-top">
                  <div className="credit-chip" style={{ background: `linear-gradient(135deg, ${c.color ?? '#555'}, ${c.color ?? '#555'}B3)` }}>
                    {c.primary && <IconStar size={11} />}
                  </div>
                  <div className="row-main">
                    <span className="row-title">{c.name} {c.primary && <span className="tag star-tag"><IconStar size={10} /> 主力卡</span>}</span>
                    <span className="row-sub">結帳日 每月 {c.statementDay} 日 · 扣款日 每月 {c.dueDay} 日</span>
                  </div>
                  <button className="btn small ghost" onClick={() => setEditAcc(c)}>編輯</button>
                </div>
                <div className="credit-nums">
                  <div><span className="muted small">本期應繳</span><Money v={c.billed ?? 0} className="strong" /></div>
                  <div><span className="muted small">未出帳</span><Money v={c.unbilled ?? 0} /></div>
                  <div><span className="muted small">合計</span><Money v={cardDebt(c)} /></div>
                </div>
                <div className="autopay">
                  <span className={`light ${status}`} />
                  <span className="autopay-text">
                    自動扣繳：<b>{pay?.name ?? '未綁定'}</b>　餘額 <Money v={pay?.balance ?? 0} />
                    <span className={`status ${status}`}>
                      {!c.billed ? '本期無應繳' : ok ? '餘額足夠扣款' : `不足 ${money(sameNeed - (pay?.balance ?? 0), hidden)}`}
                    </span>
                  </span>
                </div>
                <div className="credit-actions">
                  <button className="btn small ghost" onClick={() => setStmtCard(c)}>帳單明細</button>
                  <button className="btn small ghost" disabled={!c.unbilled} onClick={() => { cardStatement(c.id); flash(`${c.name} 已結帳出帳`) }}>結帳出帳</button>
                  <button className="btn small primary" disabled={!c.billed} onClick={() => autopay(c)}>完成自動扣繳</button>
                </div>
              </section>
            )
          })}
          {loans.length > 0 && (
            <section className="card list-card">
              <div className="card-head pad"><h2>其他負債</h2></div>
              {loans.map((a) => (
                <button key={a.id} className="row" onClick={() => setEditAcc(a)}>
                  <BankBadge name={a.name} color={a.color} />
                  <span className="row-main"><span className="row-title">{a.name}</span><span className="row-sub">未償餘額</span></span>
                  <Money v={-a.balance} className="row-amt neg" />
                </button>
              ))}
            </section>
          )}
          <div className="list-actions center">
            <button className="btn ghost small" onClick={() => setEditAcc(newAcc('card'))}>＋ 新增信用卡</button>
          </div>
        </>
      )}

      {sec === 'invest' && (
        <>
          <section className="card">
            <div className="card-head"><h2>投資總覽</h2><span className="muted small">投資交易只算資產移動，不進消費圖表</span></div>
            <InvestStatGrid st={inv} />
            <div className="chart-title small muted">近 12 個月 投入本金 vs 市值</div>
            <InvestChart data={state.invSnapshots.slice(-12)} />
            <div className="list-actions">
              <button className="btn ghost small" onClick={() => setBatch(true)} disabled={!state.holdings.length}>批次更新現價</button>
              <button className="btn ghost small" onClick={() => setEditAcc(newAcc('broker'))}>＋ 新增證券戶</button>
            </div>
          </section>
          {brokers.map((b) => {
            const hs = state.holdings.filter((h) => h.brokerId === b.id)
            const bs = brokerStats(state, b.id)
            const settle = accs.find((a) => a.id === b.settlementId)
            const monthIn = etfInvested(state, thisMonth(), b.id)
            return (
              <section key={b.id} className="card list-card">
                <div className="broker-head">
                  <BankBadge name={b.name} color={b.color} />
                  <div className="row-main">
                    <span className="row-title">{b.name} {b.tag && <span className="tag">{b.tag}</span>}</span>
                    <span className="row-sub">交割銀行：{settle?.name ?? '未設定'} · 交割現金 {money(b.balance, hidden)}</span>
                  </div>
                  <button className="btn small ghost" onClick={() => setEditAcc(b)}>編輯</button>
                </div>
                <div className="broker-stats"><InvestStatGrid st={bs} compact /></div>
                {(b.monthlyTarget ?? 0) > 0 && (
                  <div className="etf-progress">
                    <div className="row-split">
                      <span className="small">本月定期投入本金</span>
                      <span className="small"><Money v={monthIn} /> / <Money v={b.monthlyTarget ?? 0} /></span>
                    </div>
                    <Progress value={monthIn} max={b.monthlyTarget ?? 0} tone="green" />
                  </div>
                )}
                {hs.map((h) => {
                  const v = h.shares * h.price
                  const pl = v - h.shares * h.cost
                  return (
                    <button key={h.id} className="row hold-row" onClick={() => setEditHold(h)}>
                      <span className="sym">{h.symbol}</span>
                      <span className="row-main">
                        <span className="row-title">{h.name}</span>
                        <span className="row-sub">{h.shares.toLocaleString()} 股 · 均價 {h.cost} · 現價 {h.price}</span>
                      </span>
                      <span className="hold-r">
                        <Money v={v} className="row-amt" />
                        <span className={`num small ${pl >= 0 ? 'pos' : 'neg'}`}>{money(pl, hidden, { sign: true, prefix: false })}（{pct(h.cost ? h.price / h.cost - 1 : 0)}）</span>
                      </span>
                    </button>
                  )
                })}
                <div className="trade-actions">
                  <button className="btn small ghost" onClick={() => setTrade({ broker: b, kind: 'deposit' })}>入金</button>
                  <button className="btn small primary" onClick={() => setTrade({ broker: b, kind: 'buy' })}>記買進</button>
                  <button className="btn small ghost" disabled={!hs.length} onClick={() => setTrade({ broker: b, kind: 'sell' })}>賣出</button>
                  <button className="btn small ghost" disabled={!hs.length} onClick={() => setTrade({ broker: b, kind: 'dividend' })}>配息</button>
                </div>
              </section>
            )
          })}
        </>
      )}

      {stmtCard && <StatementSheet card={stmtCard} onClose={() => setStmtCard(null)} />}
      {trade && <TradeSheet broker={trade.broker} initial={trade.kind} onClose={() => setTrade(null)} />}
      {editAcc && <AccountEditor acc={editAcc} onClose={() => setEditAcc(null)} />}
      {editHold && <HoldingEditor h={editHold} onClose={() => setEditHold(null)} />}
      {batch && <BatchPrice onClose={() => setBatch(false)} />}
    </div>
  )
}

function BankRow({ a, onClick }: { a: Account; onClick: () => void }) {
  const { hidden } = useStore()
  const fx = isFx(a)
  const sub = a.kind === 'cash'
    ? a.cashTarget ? `每月領現目標 ${money(a.cashTarget, hidden)}` : '電子錢包'
    : fx
      ? a.fxBalance !== undefined && a.currency !== '多幣別'
        ? `${a.currency} ${hidden ? '••••' : a.fxBalance.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}${a.fxRate ? ` · 匯率 ${a.fxRate}` : ''}`
        : `${a.currency} · 以約當台幣記錄`
      : '台幣帳戶'
  return (
    <button className="row" onClick={onClick}>
      <BankBadge name={a.name} color={a.color} />
      <span className="row-main">
        <span className="row-title">{a.name} {a.tag && <span className="tag">{a.tag}</span>}</span>
        <span className="row-sub">{sub}</span>
      </span>
      <span className="hold-r">
        <Money v={a.balance} className={`row-amt ${a.balance < 0 ? 'neg' : ''}`} />
        {fx && <span className="muted tiny">約當台幣</span>}
      </span>
      <IconChevron className="chev" />
    </button>
  )
}

const numIn = (v: number | undefined, set: (n: number) => void, opts: { decimal?: boolean; min?: number; max?: number } = {}) => (
  <input
    inputMode={opts.decimal ? 'decimal' : 'numeric'}
    type="number"
    step={opts.decimal ? 'any' : 1}
    min={opts.min}
    max={opts.max}
    value={Number.isFinite(v) ? v : ''}
    onChange={(e) => set(e.target.value === '' ? 0 : Number(e.target.value))}
  />
)

export function AccountEditor({ acc, onClose }: { acc: Account; onClose: () => void }) {
  const { state, upsertAccount, deleteAccount, flash } = useStore()
  const [a, setA] = useState<Account>(acc)
  const exists = state.accounts.some((x) => x.id === acc.id)
  const set = (p: Partial<Account>) => setA((x) => ({ ...x, ...p }))
  const banks = state.accounts.filter((x) => x.kind === 'bank' && !isFx(x))
  const kindName = { bank: isFx(a) ? '外幣帳戶' : '銀行帳戶', cash: '現金錢包', card: '信用卡', broker: '證券戶', loan: '負債／貸款' }[a.kind]
  const save = () => {
    if (!a.name.trim()) return flash('請輸入名稱')
    upsertAccount({ ...a, name: a.name.trim(), tag: a.tag?.trim() || undefined })
    flash(exists ? '已更新' : `已新增${kindName}`)
    onClose()
  }
  const remove = () => {
    if (!window.confirm(`刪除「${a.name}」？既有紀錄會保留，但不再連動此帳戶。`)) return
    deleteAccount(a.id)
    flash('已刪除')
    onClose()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${exists ? '編輯' : '新增'}${kindName}`}
      footer={
        <div className="foot-row">
          {exists && <button className="btn danger ghost" onClick={remove}>刪除</button>}
          <button className="btn primary grow" onClick={save}>儲存</button>
        </div>
      }
    >
      <div className="two-col">
        <Field label="名稱"><input value={a.name} onChange={(e) => set({ name: e.target.value })} placeholder="例如：中信銀行" /></Field>
        <Field label="標籤（選填）"><input value={a.tag ?? ''} onChange={(e) => set({ tag: e.target.value })} placeholder="例如：薪資帳戶" /></Field>
      </div>
      {a.kind === 'bank' && (
        <Field label="幣別">
          <select
            value={a.currency ?? 'TWD'}
            onChange={(e) => {
              const c = e.target.value
              if (c === 'TWD') set({ currency: undefined, fxBalance: undefined, fxRate: undefined })
              else set({ currency: c, fxBalance: a.fxBalance ?? 0, fxRate: c === '多幣別' ? undefined : a.fxRate })
            }}
          >
            <option value="TWD">台幣 TWD</option>
            {FX_CURRENCIES.map((c) => <option key={c} value={c}>{c === '多幣別' ? '多幣別（只記約當台幣）' : `外幣 ${c}`}</option>)}
          </select>
        </Field>
      )}
      {a.kind === 'bank' && isFx(a) && a.currency !== '多幣別' && (
        <div className="two-col">
          <Field label={`原幣餘額（${a.currency}）`}>
            {numIn(a.fxBalance, (n) => set({ fxBalance: n, ...(a.fxRate ? { balance: Math.round(n * a.fxRate) } : {}) }), { decimal: true })}
          </Field>
          <Field label="匯率（1 外幣 = ? 台幣）">
            {numIn(a.fxRate, (n) => set({ fxRate: n, balance: Math.round((a.fxBalance ?? 0) * n) }), { decimal: true, min: 0 })}
          </Field>
        </div>
      )}
      {(a.kind === 'bank' || a.kind === 'cash' || a.kind === 'loan') && (
        <Field
          label={a.kind === 'loan' ? '未償餘額' : isFx(a) ? '約當台幣（NT$）' : '目前餘額'}
          hint={isFx(a) ? '改這裡會依原幣餘額自動回算匯率；計入外幣存款小計與總淨資產' : '直接校正餘額，不會產生收支紀錄'}
        >
          {numIn(a.balance, (n) => set({ balance: n, ...(isFx(a) && (a.fxBalance ?? 0) > 0 && a.currency !== '多幣別' ? { fxRate: Math.round((n / (a.fxBalance as number)) * 10000) / 10000 } : {}) }))}
        </Field>
      )}
      {(a.kind === 'bank' || a.kind === 'cash') && (
        <label className="toggle-row">
          <span>🐷 儲蓄帳戶<br /><span className="muted tiny">轉入這個帳戶的錢算「儲蓄」（證券戶入金一律算），轉出到一般帳戶會扣回</span></span>
          <input type="checkbox" className="switch" checked={!!a.savings} onChange={(e) => set({ savings: e.target.checked || undefined })} />
        </label>
      )}
      {a.kind === 'cash' && <Field label="每月領現目標（電子錢包可留 0）">{numIn(a.cashTarget, (n) => set({ cashTarget: n }), { min: 0 })}</Field>}
      {a.kind === 'card' && (
        <>
          <label className="toggle-row">
            <span><IconStar size={12} className="star" /> 主力卡（快速記帳置頂）</span>
            <input type="checkbox" className="switch" checked={!!a.primary} onChange={(e) => set({ primary: e.target.checked })} />
          </label>
          <Field label="自動扣繳銀行" hint="可隨時切換到任何銀行帳戶，發薪日分流會自動改算">
            <select value={a.payAccountId ?? ''} onChange={(e) => set({ payAccountId: e.target.value })}>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}{b.tag ? `（${b.tag}）` : ''}</option>)}
            </select>
          </Field>
          <div className="two-col">
            <Field label="結帳日（每月）">{numIn(a.statementDay, (n) => set({ statementDay: Math.min(31, Math.max(1, n)) }), { min: 1, max: 31 })}</Field>
            <Field label="扣款日（每月）">{numIn(a.dueDay, (n) => set({ dueDay: Math.min(31, Math.max(1, n)) }), { min: 1, max: 31 })}</Field>
          </div>
          <div className="two-col">
            <Field label="本期應繳">{numIn(a.billed, (n) => set({ billed: n }), { min: 0 })}</Field>
            <Field label="未出帳">{numIn(a.unbilled, (n) => set({ unbilled: n }), { min: 0 })}</Field>
          </div>
        </>
      )}
      {a.kind === 'broker' && (
        <div className="two-col">
          <Field label="交割銀行">
            <select value={a.settlementId ?? ''} onChange={(e) => set({ settlementId: e.target.value })}>
              <option value="">未設定</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="每月定期投入（選填）">{numIn(a.monthlyTarget, (n) => set({ monthlyTarget: n }), { min: 0 })}</Field>
        </div>
      )}
      <div className="field">
        <span className="field-label">代表色</span>
        <div className="color-row">
          {COLORS.map((c) => (
            <button key={c} type="button" aria-label={c} className={`swatch ${a.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => set({ color: c })} />
          ))}
        </div>
      </div>
    </Sheet>
  )
}

function HoldingEditor({ h, onClose }: { h: Holding; onClose: () => void }) {
  const { state, upsertHolding, deleteHolding, flash } = useStore()
  const [x, setX] = useState<Holding>(h)
  const exists = state.holdings.some((y) => y.id === h.id)
  const set = (p: Partial<Holding>) => setX((v) => ({ ...v, ...p }))
  const brokers = state.accounts.filter((a) => a.kind === 'broker')
  const save = () => {
    if (!x.symbol.trim()) return flash('請輸入代號')
    upsertHolding({ ...x, symbol: x.symbol.trim().toUpperCase(), name: x.name.trim() || x.symbol.trim() })
    flash(exists ? '持倉已更新' : '已新增持倉')
    onClose()
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={exists ? '編輯持倉' : '新增持倉'}
      footer={
        <div className="foot-row">
          {exists && <button className="btn danger ghost" onClick={() => { deleteHolding(x.id); flash('已刪除持倉'); onClose() }}>刪除</button>}
          <button className="btn primary grow" onClick={save}>儲存</button>
        </div>
      }
    >
      <div className="two-col">
        <Field label="代號"><input value={x.symbol} onChange={(e) => set({ symbol: e.target.value })} placeholder="0050" /></Field>
        <Field label="名稱"><input value={x.name} onChange={(e) => set({ name: e.target.value })} placeholder="元大台灣50" /></Field>
      </div>
      <Field label="證券戶">
        <select value={x.brokerId} onChange={(e) => set({ brokerId: e.target.value })}>
          {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <div className="two-col">
        <Field label="股數">{numIn(x.shares, (n) => set({ shares: n }), { decimal: true, min: 0 })}</Field>
        <Field label="平均成本（每股）">{numIn(x.cost, (n) => set({ cost: n }), { decimal: true, min: 0 })}</Field>
      </div>
      <Field label="現價" hint={`市值 ${money(x.shares * x.price)} · 損益 ${money(x.shares * (x.price - x.cost), false, { sign: true })}`}>
        {numIn(x.price, (n) => set({ price: n }), { decimal: true, min: 0 })}
      </Field>
    </Sheet>
  )
}

function BatchPrice({ onClose }: { onClose: () => void }) {
  const { state, upsertHolding, flash } = useStore()
  const [prices, setPrices] = useState<Record<string, number>>(Object.fromEntries(state.holdings.map((h) => [h.id, h.price])))
  const save = () => {
    for (const h of state.holdings) if (prices[h.id] !== h.price) upsertHolding({ ...h, price: prices[h.id] })
    flash('現價已更新')
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title="批次更新現價" footer={<button className="btn primary grow" onClick={save}>全部儲存</button>}>
      {state.holdings.map((h) => (
        <div key={h.id} className="batch-row">
          <span className="sym">{h.symbol}</span>
          <span className="row-main"><span className="row-title">{h.name}</span><span className="row-sub">{state.accounts.find((a) => a.id === h.brokerId)?.name}</span></span>
          <input
            className="price-in"
            type="number"
            inputMode="decimal"
            step="any"
            value={prices[h.id] ?? ''}
            onChange={(e) => setPrices((p) => ({ ...p, [h.id]: Number(e.target.value) }))}
          />
        </div>
      ))}
    </Sheet>
  )
}
