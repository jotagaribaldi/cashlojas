import type { ReactNode } from 'react';

export function StatCard({ label, value, change, icon, accent = 'green' }: { label: string; value: string; change?: string; icon: ReactNode; accent?: 'green' | 'blue' | 'orange' | 'purple' }) {
  return <article className={`stat-card stat-${accent}`}><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong className="stat-value">{value}</strong>{change && <span className="stat-change">{change}</span>}</article>;
}
