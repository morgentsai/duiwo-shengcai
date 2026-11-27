import { useState } from 'react'
import { RecurSettings } from '../components/RecurSettings'
import type { ReactNode } from 'react'
import type { Account, AccountKind } from '../types'
import { useStore } from '../store'
import { fmtTaipei, money, resolvePrefs, uid } from '../logic'
import { EntryPrefsCard } from '../components/EntryPrefs'
import { BudgetSettings } from '../components/Budget'
import { AllocationSettings } from '../components/Allocation'
import { DataCard, DemoCard, SyncCard, TemplateCard } from '../components/SettingsCards'
import { AccountEditor } from './Assets'
import { CatManager } from '../components/CatEditor'
import { BankBadge } from '../components/ui'
import { Avatar, ProfileCard, useProfile } from '../components/Profile'
import { IconChevron, IconChevronL, IconStar } from '../components/icons'

export const APP_VERSION = '3.3.0'
export type SettingsSub = 'profile' | 'prefs' | 'budget' | 'accounts' | 'cats' | 'recur' | 'sync' | 'data' | 'demo' | 'about'
export const SETTINGS_TITLES: Record<SettingsSub, string> = {
  profile: '個人檔案', prefs: '記帳預設值', budget: '每月花費上限', accounts: '帳戶與信用卡', cats: '分類與子分類', recur: '週期性支出',
  sync: '雲端同步', data: '資料匯入／匯出', demo: '示範資料', about: 'App 資訊',
}
const COLORS = ['#0A84FF', '#34C759', '#FF9F0A', '#FF3B30', '#BF5AF2', '#5E5CE6', '#30B0C7', '#A2845E', '#8E8E93']

function Row({ icon, color, title, detail, onClick, right }: { icon: string; color: string; title: string; detail?: string; onClick?: () => void; right?: ReactNode }) {
  const inner = (
    <>
      <span className="set-icon" style={{ background: color }}>{icon}</span>
      <span className="set-title">{title}</span>
      {detail && <span className="set-detail">{detail}</span>}
      {right ?? (onClick && <IconChevron className="chev" size={16} />)}
    </>
  )
  return onClick ? <button className="set-row" onClick={onClick}>{inner}</button> : <div className="set-row">{inner}</div>
}

export function Settings({ sub, go }: { sub?: SettingsSub; go: (sub?: SettingsSub) => void }) {
  const { state, hidden, setHidden, expCats, syncStatus } = useStore()
  const syncLabel = { off: '未登入', idle: '待同步', syncing: '同步中…', ok: '已同步', error: '同步失敗' }[syncStatus]
  if (sub) return <SubView sub={sub} back={() => go()} />
  const P = resolvePrefs(state)
  const pay = state.accounts.find((a) => a.id === P.payId)?.name ?? '—'
  const limits = Object.values(state.budgets).filter((v) => v > 0).length
  const cards = state.accounts.filter((a) => a.kind === 'card').length
  const me = useProfile()
  return (
    <div className="page settings">
      <div className="set-group">
        <button className="set-row profile-row" onClick={() => go('profile')}>
          <Avatar size={44} />
          <span className="set-title"><b>{me.name}</b><span className="muted tiny">名稱、頭貼</span></span>
          <IconChevron className="chev" size={16} />
        </button>
      </div>
      <div className="set-group-h">記帳</div>
      <div className="set-group">
        <Row icon="✍️" color="#0A84FF" title="記帳預設值" detail={pay} onClick={() => go('prefs')} />
        <Row icon="🎯" color="#34C759" title="每月花費上限" detail={limits ? `${limits} 個分類` : '未設定'} onClick={() => go('budget')} />
        <Row icon="🗂️" color="#FF9F0A" title="分類與子分類" detail={`${expCats.length} 類`} onClick={() => go('cats')} />
        <Row icon="🔁" color="#FF9F0A" title="週期性支出" detail={`${(state.recurs ?? []).length} 條規則`} onClick={() => go('recur')} />
      </div>

      <div className="set-group-h">帳戶</div>
      <div className="set-group">
        <Row icon="💳" color="#5E5CE6" title="帳戶與信用卡" detail={`${state.accounts.length} 個・${cards} 張卡`} onClick={() => go('accounts')} />
      </div>

      <div className="set-group-h">資料</div>
      <div className="set-group">
        <Row icon="☁️" color="#30B0C7" title="雲端同步" detail={syncLabel} onClick={() => go('sync')} />
        <Row icon="📥" color="#8E8E93" title="資料匯入／匯出" detail="CSV・JSON" onClick={() => go('data')} />
        <Row icon="🧪" color="#FF9500" title="示範資料／清空" detail={state.isDemo ? '示範中' : '正式資料'} onClick={() => go('demo')} />
      </div>

      <div className="set-group-h">顯示</div>
      <div className="set-group">
        <Row
          icon="👁️"
          color="#AF52DE"
          title="隱藏金額"
          right={<input type="checkbox" className="switch" checked={hidden} onChange={(e) => setHidden(e.target.checked)} aria-label="隱藏金額" />}
        />
      </div>
      <p className="set-foot">開啟後所有金額顯示為 ••••，適合在外面打開 App。右上角的 👁 也可以快速切換。</p>

      <div className="set-group-h">關於</div>
      <div className="set-group">
        <Row icon="ℹ️" color="#636366" title="App 資訊" detail={`v${APP_VERSION}`} onClick={() => go('about')} />
      </div>
    </div>
  )
}

function SubView({ sub, back }: { sub: SettingsSub; back: () => void }) {
  return (
    <div className="page settings">
      <button className="set-back" onClick={back}><IconChevronL size={18} /> 設定</button>
      <h2 className="set-sub-title">{SETTINGS_TITLES[sub]}</h2>
      {sub === 'profile' && <ProfileCard />}
      {sub === 'prefs' && <EntryPrefsCard standalone />}
      {sub === 'recur' && <RecurSettings />}
      {sub === 'budget' && (
        <>
          <BudgetSettings standalone />
          <AllocationSettings />
          <a className="set-link" href="#analytics">看本月花費進度（分析頁）›</a>
        </>
      )}
      {sub === 'accounts' && <AccountsSettings />}
      {sub === 'cats' && <CatManager />}
      {sub === 'sync' && <SyncCard />}
      {sub === 'data' && <TemplateCard />}
      {sub === 'data' && <DataCard />}
      {sub === 'demo' && <DemoCard />}
      {sub === 'about' && <About />}
    </div>
  )
}

function AccountsSettings() {
  const { state, hidden } = useStore()
  const [edit, setEdit] = useState<Account | null>(null)
  const accs = state.accounts
  const name = (id?: string) => accs.find((a) => a.id === id)?.name ?? '未綁定'
  const groups: [string, AccountKind[]][] = [['銀行與現金', ['bank', 'cash']], ['信用卡', ['card']], ['證券戶', ['broker']], ['其他負債', ['loan']]]
  const banks = accs.filter((a) => a.kind === 'bank')
  const make = (kind: AccountKind): Account => ({
    id: uid(), name: '', kind, balance: 0, color: COLORS[accs.length % COLORS.length],
    ...(kind === 'card' ? { payAccountId: banks[0]?.id, statementDay: 5, dueDay: 20, billed: 0, unbilled: 0, primary: false } : {}),
  })
  return (
    <>
      {groups.map(([g, kinds]) => {
        const list = accs.filter((a) => kinds.includes(a.kind))
        if (!list.length && g === '其他負債') return null
        return (
          <div key={g}>
            <div className="set-group-h">{g}</div>
            <div className="set-group">
              {list.map((a) => (
                <button key={a.id} className="set-row" onClick={() => setEdit(a)}>
                  <BankBadge name={a.name} color={a.color} />
                  <span className="set-title">
                    {a.name} {a.primary && <IconStar size={12} className="star" />}{a.savings && <span className="tag save">儲蓄</span>}
                    <span className="set-sub">
                      {a.kind === 'card'
                        ? `結帳 ${a.statementDay} 日・扣款 ${a.dueDay} 日・${name(a.payAccountId)} 扣繳`
                        : a.kind === 'broker'
                          ? `交割：${name(a.settlementId)}${a.monthlyTarget ? `・每月定投 ${money(a.monthlyTarget, hidden)}` : ''}`
                          : `${a.tag ?? (a.kind === 'cash' ? '現金／電子錢包' : '銀行')}・${money(a.balance, hidden)}`}
                    </span>
                  </span>
                  <IconChevron className="chev" size={16} />
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <div className="list-actions center">
        <button className="btn ghost small" onClick={() => setEdit(make('bank'))}>＋ 銀行帳戶</button>
        <button className="btn ghost small" onClick={() => setEdit(make('card'))}>＋ 信用卡</button>
        <button className="btn ghost small" onClick={() => setEdit(make('broker'))}>＋ 證券戶</button>
      </div>
      <p className="set-foot">點帳戶可修改名稱、結帳日／扣款日、扣繳銀行、主力卡 ★、交割帳戶與每月定投金額。</p>
      {edit && <AccountEditor acc={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function About() {
  const { state } = useStore()
  const rows: [string, string][] = [
    ['App', '對我生財'],
    ['版本', `v${APP_VERSION}`],
    ['資料格式', `v${state.version}（舊版資料會自動升級）`],
    ['資料筆數', `${state.accounts.length} 個帳戶・${state.txs.length} 筆紀錄・${state.holdings.length} 檔持倉`],
    ['本機最後修改', `${fmtTaipei(state.updatedAt)}（台北時間）`],
    ['時區', 'Asia/Taipei（UTC+8）'],
  ]
  return (
    <>
      <div className="set-group">
        {rows.map(([k, v]) => (
          <div key={k} className="set-row"><span className="set-title">{k}</span><span className="set-detail wrap">{v}</span></div>
        ))}
      </div>
      <p className="set-foot">隱私：所有資料只存在你這台裝置的瀏覽器，不會上傳到任何伺服器。</p>
    </>
  )
}
