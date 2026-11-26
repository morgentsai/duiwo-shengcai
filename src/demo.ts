import type { Account, AppState, Holding, InvSnapshot, Tx } from './types'
import { applyTrade, brokerStats, cardStatements, groupStatus, shiftMonth, thisMonth, todayStr, upsertSnapshot } from './logic'

export const BASE_ACCOUNTS: Account[] = [
  { id: 'mega', name: '兆豐銀行', kind: 'bank', tag: '薪資帳戶', balance: 0, color: '#C8102E' },
  { id: 'richart', name: 'Richart 數位帳戶', kind: 'bank', tag: '中繼帳戶 A', balance: 0, color: '#E2007A' },
  { id: 'taishin', name: '台新銀行', kind: 'bank', balance: 0, color: '#D6001C' },
  { id: 'sinopac', name: '永豐大戶', kind: 'bank', tag: '交割與扣繳', balance: 0, color: '#E60012' },
  { id: 'cathay', name: '國泰世華', kind: 'bank', balance: 0, color: '#00A651' },
  { id: 'fubon', name: '台北富邦', kind: 'bank', balance: 0, color: '#0067B1' },
  { id: 'esun', name: '玉山銀行', kind: 'bank', balance: 0, color: '#00897B' },
  { id: 'kgi', name: '凱基銀行', kind: 'bank', balance: 0, color: '#F39800' },
  { id: 'fubon-usd', name: '台北富邦 外幣 USD', kind: 'bank', tag: '外幣存款', currency: 'USD', fxBalance: 0, fxRate: 32.5, balance: 0, color: '#0067B1' },
  { id: 'fubon-eur', name: '台北富邦 外幣 EUR', kind: 'bank', tag: '外幣存款', currency: 'EUR', fxBalance: 0, fxRate: 36, balance: 0, color: '#0067B1' },
  { id: 'richart-fx', name: 'Richart 外幣', kind: 'bank', tag: '外幣存款', currency: 'JPY', fxBalance: 0, fxRate: 0.2065, balance: 0, color: '#E2007A' },
  { id: 'sinopac-fx', name: '永豐大戶 外幣', kind: 'bank', tag: '外幣存款', currency: '多幣別', fxBalance: 0, balance: 0, color: '#E60012' },
  { id: 'cash', name: '現金錢包', kind: 'cash', balance: 0, cashTarget: 5000, color: '#34C759' },
  { id: 'linepay-money', name: 'LINE PAY MONEY', kind: 'cash', tag: '電子錢包', balance: 0, color: '#06C755' },
  { id: 'br-sinopac', name: '永豐證券', kind: 'broker', balance: 0, settlementId: 'sinopac', monthlyTarget: 15000, tag: '每月 ETF', color: '#E60012' },
  { id: 'br-cathay', name: '國泰證券', kind: 'broker', balance: 0, settlementId: 'cathay', color: '#00A651' },
  { id: 'br-fubon', name: '台北富邦證券', kind: 'broker', balance: 0, settlementId: 'fubon', color: '#0067B1' },
  { id: 'c-richart', name: 'Richart 卡', kind: 'card', balance: 0, primary: true, payAccountId: 'richart', statementDay: 5, dueDay: 20, billed: 0, unbilled: 0, color: '#E2007A' },
  { id: 'c-cube', name: '國泰 Cube', kind: 'card', balance: 0, primary: true, payAccountId: 'cathay', statementDay: 10, dueDay: 25, billed: 0, unbilled: 0, color: '#00A651' },
  { id: 'c-kgi', name: '凱基誠品', kind: 'card', balance: 0, payAccountId: 'kgi', statementDay: 12, dueDay: 27, billed: 0, unbilled: 0, color: '#F39800' },
  { id: 'c-sinopac', name: '永豐卡', kind: 'card', balance: 0, payAccountId: 'sinopac', statementDay: 15, dueDay: 30, billed: 0, unbilled: 0, color: '#E60012' },
  { id: 'c-linepay', name: '中信 LINE PAY', kind: 'card', balance: 0, payAccountId: 'fubon', statementDay: 8, dueDay: 23, billed: 0, unbilled: 0, color: '#06C755' },
]

export const DEFAULT_BUDGETS: Record<string, number> = {
  餐飲食品: 9000, 服飾美容: 1500, 居家生活: 3500, 交通: 2000, 學習與3C: 2000,
  休閒娛樂: 1500, 醫療保健: 1500, 人情公益: 2000, 家庭: 3000, 旅遊: 4000,
}

const DEMO_BAL: Record<string, Partial<Account>> = {
  mega: { balance: 92650 }, richart: { balance: 8200 }, taishin: { balance: 12300 }, sinopac: { balance: 6480 },
  cathay: { balance: 5200 }, fubon: { balance: 3100 }, esun: { balance: 25000 }, kgi: { balance: 1000 }, cash: { balance: 1850 }, 'linepay-money': { balance: 2380 },
  'fubon-usd': { fxBalance: 1500, balance: 48750 }, 'fubon-eur': { fxBalance: 2000, balance: 72000 },
  'richart-fx': { fxBalance: 60000, balance: 12390 }, 'sinopac-fx': { balance: 320 },
  'c-richart': { billed: 18420, unbilled: 6380 }, 'c-cube': { billed: 12860, unbilled: 4215 }, 'c-kgi': { billed: 3250, unbilled: 980 },
  'c-sinopac': { billed: 2180, unbilled: 650 }, 'c-linepay': { billed: 1560, unbilled: 420 },
}

const DEMO_HOLDINGS: Omit<Holding, 'id'>[] = [
  { brokerId: 'br-sinopac', symbol: '0050', name: '元大台灣50', shares: 1200, cost: 152.4, price: 168.3 },
  { brokerId: 'br-sinopac', symbol: '006208', name: '富邦台50', shares: 1500, cost: 92.1, price: 101.85 },
  { brokerId: 'br-cathay', symbol: '00878', name: '國泰永續高股息', shares: 3000, cost: 21.35, price: 22.08 },
  { brokerId: 'br-fubon', symbol: '2330', name: '台積電', shares: 50, cost: 812, price: 1045 },
]

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const SPEND: { cat: string; subs: string[]; notes: string[]; min: number; max: number; freq: number }[] = [
  { cat: '餐飲食品', subs: ['晚餐', '晚餐', '晚餐', '早餐', '早餐', '午餐'], notes: ['', '拉麵', '便當', '', '', '牛肉麵'], min: 45, max: 320, freq: 1.3 },
  { cat: '餐飲食品', subs: ['飲料', '飲料', '下午茶', '點心零嘴'], notes: ['', '手搖飲', '路易莎', ''], min: 35, max: 180, freq: 0.8 },
  { cat: '居家生活', subs: ['居家雜務', '居家雜務', '日用品', '網購', '寵物'], notes: ['全聯', '收納盒', '', '網購', '貓砂'], min: 120, max: 1250, freq: 0.24 },
  { cat: '家庭', subs: ['媽媽購物', '海象', '家'], notes: ['', '飼料', ''], min: 150, max: 1800, freq: 0.1 },
  { cat: '交通', subs: ['油錢', '停車過路', '停車過路', '大眾運輸', '大眾運輸', '計程車'], notes: ['', '', '', '', '', ''], min: 15, max: 320, freq: 0.17 },
  { cat: '人情公益', subs: ['送禮請客', '送禮請客', '捐款', '拜拜'], notes: ['生日禮物', '', '', ''], min: 100, max: 1500, freq: 0.045 },
  { cat: '學習與3C', subs: ['書', '文具', '線上課程'], notes: ['', '', ''], min: 99, max: 690, freq: 0.03 },
  { cat: '休閒娛樂', subs: ['電影', '公仔', '小禮物', '水晶'], notes: ['', '盲盒', '', ''], min: 120, max: 900, freq: 0.04 },
  { cat: '服飾美容', subs: ['保養品', '衣服', '鞋包配件'], notes: ['', '', ''], min: 290, max: 1580, freq: 0.03 },
  { cat: '醫療保健', subs: ['診所就醫', '購買藥物'], notes: ['', ''], min: 150, max: 450, freq: 0.03 },
]
const PAY_WEIGHTS = ['c-richart', 'c-richart', 'c-richart', 'c-richart', 'c-cube', 'c-cube', 'cash', 'cash', 'c-linepay', 'c-kgi', 'c-sinopac']

const gid = (m: string, k: string) => `${k}-${m}`
const mtitle = (m: string, t: string) => `${Number(m.slice(5, 7))} 月${t}`

export function buildDemo(): AppState {
  const r = rng(20261124)
  const today = todayStr()
  const cur = thisMonth()
  const todayDay = Number(today.slice(8, 10))
  const txs: Tx[] = []
  let n = 0
  const id = () => `demo-${++n}`
  // 證券：追蹤前已有持倉
  let holdings: Holding[] = DEMO_HOLDINGS.map((h, i) => ({ ...h, id: `h-${i}` }))
  const baseCost = (bid: string) => Math.round(holdings.filter((h) => h.brokerId === bid).reduce((x, h) => x + h.shares * h.cost, 0))
  const principalBase: Record<string, number> = { 'br-sinopac': baseCost('br-sinopac'), 'br-cathay': baseCost('br-cathay'), 'br-fubon': baseCost('br-fubon') }
  const brokerCash: Record<string, number> = { 'br-sinopac': 0, 'br-cathay': 0, 'br-fubon': 0 }
  const etfPrice: Record<string, number[]> = { '0050': [155.2, 158.6, 161.4, 159.8, 164.9], '006208': [94.1, 96.3, 97.8, 96.9, 99.6] }

  // 從今年 1 月開始（至少 6 個月），讓「年度」分析有內容
  const N = Math.max(5, Number(cur.slice(5, 7)) - 1)
  for (let i = N; i >= 0; i--) {
    const m = shiftMonth(cur, -i)
    const [y, mo] = m.split('-').map(Number)
    const days = new Date(Date.UTC(y, mo, 0)).getUTCDate()
    const d = (day: number) => `${m}-${String(day).padStart(2, '0')}`
    const isCur = i === 0
    const lastDay = isCur ? todayDay : days
    if (5 <= lastDay) txs.push({ id: id(), type: 'income', date: d(5), amount: 68000, category: '公司薪資', toId: 'mega', note: `${mo} 月薪資` })
    // 固定支出（三大類示範）：房租水電、保險費、孝親；另外每月存 5,000 到儲蓄帳戶
    if (1 <= lastDay) txs.push({ id: id(), type: 'expense', date: d(1), amount: 12000, category: '居家生活', sub: '房租水電', fromId: 'mega', note: '房租' })
    if (mo % 2 === 0 && 18 <= lastDay) txs.push({ id: id(), type: 'expense', date: d(18), amount: 860 + (mo % 4) * 120, category: '居家生活', sub: '房租水電', fromId: 'mega', note: '電費（兩個月）' })
    if (15 <= lastDay) txs.push({ id: id(), type: 'expense', date: d(15), amount: 2350, category: '醫療保健', sub: '保險費', fromId: 'c-cube', note: '醫療＋意外險' })
    if (6 <= lastDay) txs.push({ id: id(), type: 'expense', date: d(6), amount: 3000, category: '人情公益', sub: '孝養父母', fromId: 'mega', note: '給爸媽' })
    if (10 <= lastDay) txs.push({ id: id(), type: 'transfer', date: d(10), amount: 5000, fromId: 'mega', toId: 'esun', note: '每月存錢', category: '一般轉帳' })
    if (14 <= lastDay) txs.push({ id: id(), type: 'income', date: d(14), amount: 4800, category: '家教', toId: 'linepay-money', note: '家教費' })
    if (21 <= lastDay) txs.push({ id: id(), type: 'income', date: d(21), amount: 3000, category: '租屋補助', toId: 'mega' })
    if (21 <= lastDay) txs.push({ id: id(), type: 'income', date: d(21), amount: 18 + Math.round(r() * 30), category: '利息', toId: 'richart' })
    if (i === 4) {
      // 00878 配息（國泰證券）
      txs.push({ id: id(), type: 'income', date: d(20), amount: 1980, category: '投資配息/折讓/獲利', sub: '配息', toId: 'br-cathay', note: '00878 配息', tag: 'dividend', trade: { kind: 'dividend', brokerId: 'br-cathay', symbol: '00878', name: '國泰永續高股息', shares: 0, price: 0, fee: 0 } })
      brokerCash['br-cathay'] += 1980
    }
    // 固定訂閱
    if (8 <= lastDay) txs.push({ id: id(), type: 'expense', date: d(8), amount: 330, category: '學習與3C', sub: '訂閱', fromId: 'c-cube', note: 'iCloud＋Google One' })
    if (12 <= lastDay) txs.push({ id: id(), type: 'expense', date: d(12), amount: 599, category: '學習與3C', sub: '電話網路', fromId: 'c-richart' })
    if (3 <= lastDay) txs.push({ id: id(), type: 'expense', date: d(3), amount: 650, category: '學習與3C', sub: 'ai', fromId: 'c-richart', note: '' })
    if (mo === 2 && !isCur) txs.push({ id: id(), type: 'income', date: d(10), amount: 136000, category: '公司薪資', sub: '年終獎金', toId: 'mega', note: '年終獎金' })
    if (mo === 7 && !isCur) txs.push({ id: id(), type: 'income', date: d(25), amount: 12000, category: '公司薪資', sub: '績效獎金', toId: 'mega', note: '上半年績效獎金' })
    if (!isCur && 25 <= lastDay) txs.push({ id: id(), type: 'transfer', date: d(25), amount: 8000, fromId: 'mega', toId: 'fubon', category: '一般轉帳', sub: '存錢', note: '每月存款' })
    if (!isCur && mo % 3 === 0) txs.push({ id: id(), type: 'transfer', date: d(18), amount: 30000, fromId: 'fubon', toId: 'fubon-usd', category: '一般轉帳', sub: '換匯', note: '分批換美金' })
    if (mo === 4 && !isCur) {
      const P = '示範：花蓮三天兩夜'
      txs.push({ id: id(), type: 'expense', date: d(4), amount: 2340, category: '旅遊', sub: '交通', fromId: 'c-cube', note: '太魯閣號來回', project: P })
      txs.push({ id: 'demo-hualien', type: 'expense', date: d(4), amount: 5600, category: '旅遊', sub: '住宿', fromId: 'c-cube', note: '海景民宿兩晚（3 人分帳）', project: P, share: { mine: 1870, parts: [{ name: '小美', amount: 1865 }, { name: '阿哲', amount: 1865 }] } })
      txs.push({ id: id(), type: 'expense', date: d(5), amount: 1280, category: '旅遊', sub: '吃飯', fromId: 'cash', note: '東大門夜市＋扁食', project: P })
      txs.push({ id: 'demo-hl-collect', type: 'transfer', date: d(9), amount: 3730, toId: 'linepay-money', note: '小美、阿哲還花蓮住宿', tag: 'collect', category: '收回代墊', receivableIds: ['demo-hualien-r0', 'demo-hualien-r1'] })
    }
    if (i === 2) {
      const P = '示範：週末台中小旅行'
      txs.push({ id: id(), type: 'expense', date: d(13), amount: 1490, category: '旅遊', sub: '交通', fromId: 'c-cube', note: '高鐵來回', project: P })
      txs.push({ id: 'demo-stay', type: 'expense', date: d(13), amount: 2680, category: '旅遊', sub: '住宿', fromId: 'c-richart', note: '民宿一晚（和小美分攤）', project: P, share: { mine: 1340, parts: [{ name: '小美', amount: 1340 }] } })
      txs.push({ id: id(), type: 'expense', date: d(13), amount: 860, category: '旅遊', sub: '吃飯', fromId: 'cash', note: '審計新村', project: P })
      txs.push({ id: id(), type: 'expense', date: d(14), amount: 420, category: '旅遊', sub: '伴手禮', fromId: 'cash', note: '太陽餅', project: P })
    }
    if (isCur && todayDay >= 6) {
      // 本月：卡費總池與生活費已執行（收合成群組），ETF 留給使用者自己按
      const g1 = { groupId: gid(m, 'cardflow'), groupTitle: mtitle(m, '卡費分流') }
      txs.push({ id: 'demo-flow-pool', type: 'transfer', date: d(5), amount: 32000, fromId: 'mega', toId: 'richart', note: '卡費總池', tag: 'payday', category: '一般轉帳', flowKey: 'pool', ...g1 })
      txs.push({ id: 'demo-flow-cube', type: 'transfer', date: d(5), amount: 9800, fromId: 'richart', toId: 'cathay', note: '補足 國泰 Cube 扣繳', tag: 'payday', category: '一般轉帳', flowKey: 'pool', ...g1 })
      const g2 = { groupId: gid(m, 'cash'), groupTitle: mtitle(m, '生活費領現') }
      txs.push({ id: 'demo-flow-cin', type: 'transfer', date: d(5), amount: 5000, fromId: 'mega', toId: 'richart', note: '生活費現金', tag: 'payday', category: '一般轉帳', flowKey: 'cash-in', ...g2 })
      txs.push({ id: 'demo-flow-cout', type: 'transfer', date: d(6), amount: 5000, fromId: 'richart', toId: 'cash', note: 'ATM 領現', tag: 'withdraw', category: '領現', flowKey: 'cash-out', ...g2 })
    }
    if (!isCur) {
      const g1 = { groupId: gid(m, 'cardflow'), groupTitle: mtitle(m, '卡費分流') }
      txs.push({ id: id(), type: 'transfer', date: d(5), amount: 30000 + Math.round(r() * 6000), fromId: 'mega', toId: 'richart', note: '卡費總池', tag: 'payday', category: '一般轉帳', ...g1 })
      txs.push({ id: id(), type: 'transfer', date: d(5), amount: 9000 + Math.round(r() * 3000), fromId: 'richart', toId: 'cathay', note: '補足 國泰 Cube 扣繳', tag: 'payday', category: '一般轉帳', ...g1 })
      txs.push({ id: id(), type: 'transfer', date: d(5), amount: 1500 + Math.round(r() * 1500), fromId: 'richart', toId: 'kgi', note: '補足 凱基誠品 扣繳', tag: 'payday', category: '一般轉帳', ...g1 })
      const g2 = { groupId: gid(m, 'cash'), groupTitle: mtitle(m, '生活費領現') }
      txs.push({ id: id(), type: 'transfer', date: d(5), amount: 5000, fromId: 'mega', toId: 'richart', note: '生活費現金', tag: 'payday', category: '一般轉帳', ...g2 })
      txs.push({ id: id(), type: 'transfer', date: d(6), amount: 5000, fromId: 'richart', toId: 'cash', note: 'ATM 領現', tag: 'withdraw', category: '領現', ...g2 })
      // ETF 定期投入：兆豐 → 永豐證券（交割戶），隔天買進
      const g3 = { groupId: gid(m, 'etf'), groupTitle: mtitle(m, 'ETF 定期投入') }
      txs.push({ id: id(), type: 'transfer', date: d(6), amount: 15000, fromId: 'mega', toId: 'br-sinopac', note: '固定 ETF 投資', tag: 'etf', category: '投資', sub: '投入', ...g3 })
      const sym = i % 2 ? '0050' : '006208'
      const price = i <= 5 ? etfPrice[sym][5 - i] ?? etfPrice[sym][4] : Math.round(etfPrice[sym][0] * (1 - (i - 5) * 0.022 + Math.sin(i * 1.3) * 0.012) * 100) / 100
      const fee = 20
      const shares = Math.floor((15000 - fee) / price)
      const trade = { kind: 'buy' as const, brokerId: 'br-sinopac', symbol: sym, name: sym === '0050' ? '元大台灣50' : '富邦台50', shares, price, fee }
      const gross = Math.round(shares * price + fee)
      const tx: Tx = { id: id(), type: 'transfer', date: d(7), amount: gross, fromId: 'br-sinopac', note: `買進 ${sym} ${shares} 股`, tag: 'trade', category: '證券交易', sub: '買進', trade, ...g3 }
      holdings = applyTrade(holdings, tx, 1).holdings
      brokerCash['br-sinopac'] += 15000 - gross
      txs.push(tx)
    }
    for (let day = 1; day <= lastDay; day++) {
      for (const sp of SPEND) {
        if (r() < sp.freq * 0.75) {
          const amt = Math.round((sp.min + r() * (sp.max - sp.min)) / 5) * 5
          const pay = PAY_WEIGHTS[Math.floor(r() * PAY_WEIGHTS.length)]
          const k = Math.floor(r() * sp.subs.length)
          txs.push({ id: id(), type: 'expense', date: d(day), amount: amt, category: sp.cat, sub: sp.subs[k], fromId: pay, note: sp.notes[k] ?? '' })
        }
      }
    }
  }

  // 本月：一筆分帳晚餐（3 人），阿哲已還、小美待收
  const dinnerDay = `${cur}-${String(Math.max(1, todayDay - 5)).padStart(2, '0')}`
  const dinner: Tx = {
    id: 'demo-dinner', type: 'expense', date: dinnerDay, amount: 2400, category: '餐飲食品', sub: '晚餐', fromId: 'c-richart', note: '燒肉聚餐（3 人分帳）',
    share: { mine: 800, parts: [{ name: '小美', amount: 800 }, { name: '阿哲', amount: 800 }] },
  }
  txs.push(dinner)
  const collectDate = `${cur}-${String(Math.max(1, todayDay - 3)).padStart(2, '0')}`
  txs.push({ id: 'demo-collect', type: 'transfer', date: collectDate, amount: 800, toId: 'linepay-money', note: '阿哲還燒肉錢', tag: 'collect', category: '收回代墊', receivableIds: ['demo-dinner-r1'] })

  // 信用卡：依帳單期產生歷史自動扣繳，並推算目前應繳／未出帳
  const accounts = BASE_ACCOUNTS.map((a) => ({ ...a, ...DEMO_BAL[a.id], ...(a.id === 'esun' ? { savings: true } : {}) }))
  const draft = { txs, accounts, holdings, receivables: [], invSnapshots: [] } as unknown as AppState
  for (const c of accounts.filter((a) => a.kind === 'card')) {
    const sts = cardStatements(draft, c, N + 2)
    c.unbilled = sts[0].total
    c.billed = 0
    for (const st of sts.slice(1)) {
      if (!st.total) continue
      const unpaidDemo = c.id === 'c-linepay' && st === sts[1] // 示範：Line Pay 已到扣款日、尚未扣繳
      if (st.due >= today || unpaidDemo) {
        if (st === sts[1]) c.billed = st.total
        continue
      }
      const m = st.due.slice(0, 7)
      txs.push({ id: id(), type: 'transfer', date: st.due, amount: st.total, fromId: c.payAccountId, toId: c.id, note: `${c.name} 自動扣繳`, tag: 'cardpay', category: '信用卡費', split: { billed: st.total, unbilled: 0 }, groupId: gid(m, 'autopay'), groupTitle: mtitle(m, '卡費自動扣繳') })
    }
  }
  for (const b of accounts) if (b.kind === 'broker') { b.principalBase = principalBase[b.id]; b.balance = brokerCash[b.id] ?? 0 }
  // 現價
  const now: Record<string, number> = { '0050': 168.3, '006208': 101.85, '00878': 22.08, '2330': 1045 }
  holdings = holdings.map((h) => ({ ...h, price: now[h.symbol] ?? h.price }))
  txs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const state: AppState = {
    version: 2,
    isDemo: true,
    accounts,
    txs,
    holdings,
    budgets: { ...DEFAULT_BUDGETS },
    flow: { month: cur, done: todayDay >= 6 ? { pool: ['demo-flow-pool', 'demo-flow-cube'], 'cash-in': ['demo-flow-cin'], 'cash-out': ['demo-flow-cout'] } : {} },
    receivables: [
      { id: 'demo-dinner-r0', txId: 'demo-dinner', friend: '小美', amount: 800, date: dinnerDay, note: '燒肉聚餐' },
      { id: 'demo-dinner-r1', txId: 'demo-dinner', friend: '阿哲', amount: 800, date: dinnerDay, note: '燒肉聚餐', collectedBy: 'demo-collect' },
      { id: 'demo-stay-r0', txId: 'demo-stay', friend: '小美', amount: 1340, date: shiftMonth(cur, -2) + '-13', note: '民宿一晚' },
      ...(txs.some((t) => t.id === 'demo-hualien')
        ? [0, 1].map((k) => ({ id: `demo-hualien-r${k}`, txId: 'demo-hualien', friend: k ? '阿哲' : '小美', amount: 1865, date: `${cur.slice(0, 4)}-04-04`, note: '花蓮民宿', collectedBy: 'demo-hl-collect' }))
        : []),
    ],
    invSnapshots: [],
    updatedAt: Date.now(),
  }
  // 示範花費上限：依本月實際花費設定，讓部分分類呈現黃燈／紅燈
  const spentNow: Record<string, number> = {}
  for (const t of txs) if (t.type === 'expense' && t.date.startsWith(cur)) spentNow[t.category ?? ''] = (spentNow[t.category ?? ''] ?? 0) + (t.share ? t.share.mine : t.amount)
  const factor: Record<string, number> = { 餐飲食品: 1.12, 居家生活: 0.88, 學習與3C: 1.04 }
  const roundUp = (v: number) => Math.max(500, Math.ceil(v / 100) * 100)
  for (const k of Object.keys(state.budgets)) {
    const sp = spentNow[k] ?? 0
    state.budgets[k] = roundUp(factor[k] !== undefined ? sp * factor[k] : sp * 1.8 + 800)
  }
  state.budgetCfg = {
    total: Math.ceil((Object.values(spentNow).reduce((x, y) => x + y, 0) * 1.25) / 1000) * 1000,
    subs: { '餐飲食品|飲料': roundUp((txs.filter((t) => t.type === 'expense' && t.date.startsWith(cur) && t.sub === '飲料').reduce((x, t) => x + t.amount, 0)) * 0.9) },
    overrides: { [cur]: { cats: { 旅遊: 6000 } } },
  }
  // 三大類預算：固定支出依上月實際、變動支出讓本月接近黃燈；儲蓄目標 20,000（ETF 15,000＋存錢 5,000）
  const prev = shiftMonth(cur, -1)
  const lastFixed = groupStatus(state, prev).fixed.spent
  const nowVar = groupStatus(state, cur).variable.spent
  state.budgetCfg.groups = { fixed: Math.ceil((lastFixed * 1.25) / 500) * 500, variable: Math.max(8000, Math.ceil((nowVar * 1.18) / 1000) * 1000), saving: 20000 }
  // 住宿分帳的待收對應到實際交易 id
  const stay = txs.find((t) => t.note?.startsWith('民宿一晚'))
  if (stay) { stay.id = 'demo-stay' }
  // 近 12 個月投資快照（示範：每月定投 15,000，市值隨行情波動）
  const st = brokerStats(state)
  const snaps: InvSnapshot[] = []
  for (let k = 11; k >= 1; k--) {
    const principal = Math.round(st.principal - 15000 * Math.min(k, 5) - (k > 5 ? 15000 * (k - 5) : 0))
    const drift = 1 + (st.ret * (12 - k)) / 12 + Math.sin(k * 1.7) * 0.025
    snaps.push({ month: shiftMonth(cur, -k), principal, value: Math.round(principal * drift) })
  }
  state.invSnapshots = snaps
  state.invSnapshots = upsertSnapshot(state)
  return state
}

/** 清空示範資料：保留帳戶結構（含使用者新增的帳戶與卡片設定），餘額與明細歸零 */
export function clearData(s: AppState): AppState {
  return {
    ...s,
    isDemo: false,
    accounts: s.accounts.map((a) => ({ ...a, balance: 0, ...(a.kind === 'broker' ? { principalBase: 0 } : {}), ...(a.currency ? { fxBalance: 0 } : {}), ...(a.kind === 'card' ? { billed: 0, unbilled: 0 } : {}), savings: undefined })),
    txs: [],
    holdings: [],
    receivables: [],
    invSnapshots: [],
    flow: { month: thisMonth(), done: {} },
    updatedAt: Date.now(),
  }
}
