import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { IconX } from './icons'
import { useStore } from '../store'
import { money } from '../logic'

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="關閉"><IconX /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Money({ v, sign, className, prefix = true }: { v: number; sign?: boolean; className?: string; prefix?: boolean }) {
  const { hidden } = useStore()
  return <span className={`num ${className ?? ''}`}>{money(v, hidden, { sign, prefix })}</span>
}

export function Progress({ value, max, tone }: { value: number; max: number; tone?: 'blue' | 'green' | 'orange' | 'red' }) {
  const p = max > 0 ? Math.min(1, value / max) : 0
  const auto = !max ? 'blue' : value / max > 1 ? 'red' : value / max >= 0.8 ? 'orange' : 'blue'
  return (
    <div className="progress"><div className={`progress-fill ${tone ?? auto}`} style={{ width: `${p * 100}%` }} /></div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Dot({ color }: { color?: string }) {
  return <span className="dot" style={{ background: color ?? '#8E8E93' }} />
}

export function BankBadge({ name, color }: { name: string; color?: string }) {
  return (
    <span className="badge-logo" style={{ background: color ?? '#8E8E93' }}>
      {name.replace(/[^A-Za-z\u4e00-\u9fff]/g, '').slice(0, 1)}
    </span>
  )
}
