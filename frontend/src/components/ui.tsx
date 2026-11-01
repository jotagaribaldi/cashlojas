import { useState, type FormEvent, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronDown, CircleHelp, LoaderCircle, Search, X } from 'lucide-react';

export function Button({ children, variant = 'primary', size = 'md', loading, disabled, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; loading?: boolean }) {
  return <button className={`btn btn-${variant} btn-${size}`} disabled={disabled || loading} {...props}>{loading ? <LoaderCircle size={16} className="spin" /> : null}{children}</button>;
}

export function Field({ label, hint, error, children, className = '' }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return <label className={`field ${className}`}><span className="field-label">{label}</span>{children}{error ? <span className="field-error"><AlertCircle size={13} /> {error}</span> : hint ? <span className="field-hint">{hint}</span> : null}</label>;
}

export function Input({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />;
}

export function Select({ className = '', ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className="select-wrap"><select className={`input select ${className}`} {...props} /><ChevronDown size={16} /></span>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

export function PageTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-title-row"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="page-title-action">{action}</div>}</div>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'blue' | 'neutral' }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" />{children}</span>;
}

export function EmptyState({ title, description, icon = <CircleHelp size={22} /> }: { title: string; description?: string; icon?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong>{description && <p>{description}</p>}</div>;
}

export function LoadingState({ label = 'Carregando…' }: { label?: string }) {
  return <div className="loading-state"><LoaderCircle className="spin" size={19} /><span>{label}</span></div>;
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-banner"><AlertCircle size={17} /><span>{message}</span>{onRetry && <button onClick={onRetry}>Tentar novamente</button>}</div>;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Fechar" onClick={onClose}><X size={18} /></button></header>{children}</section></div>;
}

export function Toast({ message, type = 'success', onClose }: { message: string; type?: 'success' | 'error'; onClose: () => void }) {
  return <div role="status" className={`toast toast-${type}`}><span className="toast-icon">{type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}</span>{message}<button aria-label="Fechar" onClick={onClose}><X size={15} /></button></div>;
}

export function useToast() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  function show(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast((current) => current?.message === message ? null : current), 4200);
  }
  return { toast, show, close: () => setToast(null) };
}

export function SearchBox({ value, onChange, placeholder = 'Buscar…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="search-box"><Search size={16} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></div>;
}

export function Table({ children, minWidth = '680px' }: { children: ReactNode; minWidth?: string }) {
  return <div className="table-wrap" style={{ '--table-min': minWidth } as React.CSSProperties}><table>{children}</table></div>;
}

export function Form({ onSubmit, children, className = '' }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void; children: ReactNode; className?: string }) {
  return <form className={className} onSubmit={onSubmit} noValidate>{children}</form>;
}
