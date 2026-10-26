import type { ReactNode } from "react"
import { AlertCircle, Check, Loader2, type LucideIcon } from "lucide-react"

export function AccountSection({ title, description, icon: Icon, status, children }: {
  title: string
  description: string
  icon: LucideIcon
  status?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="account-section">
      <header className="account-section-heading">
        <div className="account-provider">
          <Icon aria-hidden="true" />
          <div><h3>{title}</h3><p>{description}</p></div>
        </div>
        {status}
      </header>
      <div className="account-section-body">{children}</div>
    </section>
  )
}

export function ConnectionStatus({ connected, label }: { connected: boolean; label?: string }) {
  return <span className={`account-status${connected ? " account-status-ready" : ""}`}>
    {connected ? <Check aria-hidden="true" /> : null}
    {label ?? (connected ? "Conectado" : "Sin conectar")}
  </span>
}

export function AccountLoading() {
  return <p className="account-feedback" role="status"><Loader2 className="animate-spin" aria-hidden="true" />Cargando estado…</p>
}

export function AccountLoadError({ service, onRetry }: { service: string; onRetry: () => void }) {
  return <div className="account-load-error" role="alert">
    <p><AlertCircle aria-hidden="true" />No pudimos consultar {service}. Revisá tu conexión y volvé a intentar.</p>
    <button type="button" className="account-button account-button-secondary" onClick={onRetry}>Reintentar</button>
  </div>
}
