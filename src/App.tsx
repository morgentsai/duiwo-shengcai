import { useCallback, useEffect, useState } from 'react'
import type { Tx } from './types'
import { StoreProvider, useStore } from './store'
import { Overview } from './pages/Overview'
import { Transactions } from './pages/Transactions'
import { Assets } from './pages/Assets'
import { Analytics } from './pages/Analytics'
import { SETTINGS_TITLES, Settings } from './pages/Settings'
import type { SettingsSub } from './pages/Settings'
import { TxEditor } from './components/TxEditor'
import { IconChart, IconCloud, IconEye, IconEyeOff, IconGear, IconHome, IconList, IconPlus, IconWallet } from './components/icons'

type Tab = 'home' | 'tx' | 'assets' | 'analytics' | 'settings'
const TITLES: Record<Tab, string> = { home: '總覽', tx: '記帳明細', assets: '資產與負債', analytics: '分析', settings: '設定' }
/** #tab 或 #settings/子頁 */
function parseHash(): { tab: Tab; sub?: SettingsSub } {
  const [t, sub] = location.hash.slice(1).split('/') as [Tab, SettingsSub | undefined]
  if (!(t in TITLES)) return { tab: 'home' }
  return { tab: t, sub: t === 'settings' && sub && sub in SETTINGS_TITLES ? sub : undefined }
}

function Shell() {
  const { state, hidden, setHidden, toast, clearDemo, flash, syncStatus } = useStore()
  const [tab, setTab] = useState<Tab>(() => parseHash().tab)
  const [sub, setSub] = useState<SettingsSub | undefined>(() => parseHash().sub)
  const [editorOpen, setEditorOpen] = useState(false)
  const [txProject, setTxProject] = useState<string | undefined>()
  const [editing, setEditing] = useState<Tx | undefined>()
  const [newDate, setNewDate] = useState<string | undefined>()

  useEffect(() => {
    const onHash = () => {
      if (!location.hash) return
      const h = parseHash()
      setTab(h.tab)
      setSub(h.sub)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const want = `#${tab}${tab === 'settings' && sub ? `/${sub}` : ''}`
    if (location.hash !== want) history.replaceState(null, '', want)
    window.scrollTo({ top: 0 })
  }, [tab, sub])
  /** 進設定子頁用 hash（會留下瀏覽紀錄，手機返回手勢可回上一層） */
  const goSettings = useCallback((s?: SettingsSub) => { location.hash = `settings${s ? `/${s}` : ''}` }, [])

  const openTx = useCallback((t?: Tx, date?: string) => {
    setEditing(t)
    setNewDate(date)
    setEditorOpen(true)
  }, [])
  const closeTx = useCallback(() => setEditorOpen(false), [])
  const goTab = useCallback((t: 'tx' | 'assets' | 'analytics') => { setTxProject(undefined); setSub(undefined); setTab(t) }, [])
  const openProject = useCallback((p: string) => { setTxProject(p); setTab('tx') }, [])

  const tabs: { key: Tab; label: string; icon: typeof IconHome }[] = [
    { key: 'home', label: '總覽', icon: IconHome },
    { key: 'tx', label: '明細', icon: IconList },
    { key: 'assets', label: '資產', icon: IconWallet },
    { key: 'analytics', label: '分析', icon: IconChart },
  ]

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div>
            <div className="brand">Morgen 的資產</div>
            <h1>{TITLES[tab]}</h1>
          </div>
          <div className="top-actions">
            {syncStatus !== 'off' && (
              <button className={`icon-btn sync-dot ${syncStatus}`} onClick={() => goSettings('sync')} aria-label="雲端同步狀態" title="雲端同步">
                <IconCloud />
              </button>
            )}
            <button className="icon-btn" onClick={() => setHidden(!hidden)} aria-label={hidden ? '顯示金額' : '隱藏金額'} title={hidden ? '顯示金額' : '隱藏金額'}>
              {hidden ? <IconEyeOff /> : <IconEye />}
            </button>
            <button className={`icon-btn ${tab === 'settings' ? 'on' : ''}`} onClick={() => (tab === 'settings' && !sub ? undefined : goSettings())} aria-label="設定" title="設定">
              <IconGear />
            </button>
          </div>
        </div>
      </header>

      {state.isDemo && (
        <div className="demo-bar">
          <span>👀 目前為<b>示範資料</b>，可隨意點按測試</span>
          <button
            onClick={() => {
              if (window.confirm('一鍵清空示範資料？\n\n會保留 8 個銀行帳戶、現金錢包、3 個證券戶與 5 張信用卡的設定，只把餘額與明細歸零。')) {
                clearDemo()
                flash('已清空，開始正式記帳吧！')
              }
            }}
          >
            清空，開始正式記帳
          </button>
        </div>
      )}

      <main className="main">
        {tab === 'home' && <Overview onOpenTx={openTx} goTab={goTab} />}
        {tab === 'tx' && <Transactions key={txProject ?? ''} onOpenTx={openTx} onNewTx={(d) => openTx(undefined, d)} initialProject={txProject} />}
        {tab === 'assets' && <Assets />}
        {tab === 'analytics' && <Analytics onOpenProject={openProject} />}
        {tab === 'settings' && <Settings sub={sub} go={goSettings} />}
      </main>

      <nav className="tabbar" aria-label="主選單">
        {tabs.slice(0, 2).map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => { setTxProject(undefined); setSub(undefined); setTab(t.key) }}>
            <t.icon />
            <span>{t.label}</span>
          </button>
        ))}
        <button className="fab" onClick={() => openTx()} aria-label="快速記帳">
          <IconPlus size={26} />
        </button>
        {tabs.slice(2).map((t) => (
          <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => { setSub(undefined); setTab(t.key) }}>
            <t.icon />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <TxEditor open={editorOpen} onClose={closeTx} editing={editing} initialDate={newDate} />
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
