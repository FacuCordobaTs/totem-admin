import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Building2, CreditCard, MessageCircle, Monitor, UserRound } from "lucide-react"
import { isTauri } from "@tauri-apps/api/core"
import { toast } from "sonner"
import { LogoutButton } from "@/components/auth/logout-button"
import { Header } from "@/components/dashboard/header"
import { useAuthStore } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"
import { ApiError, apiFetch } from "@/lib/api"
import { ProductoraSetupCard, ProductoraWaitingCard } from "@/components/onboarding/productora-setup-card"
import { CucuruConnectionCard } from "@/components/settings/cucuru-connection-card"
import { DesktopAppCard } from "@/components/settings/desktop-app-card"
import { MpConnectionCard } from "@/components/settings/mp-connection-card"
import { WhatsAppConnectionCard } from "@/components/settings/whatsapp-connection-card"
import "@/components/settings/account-workspace.css"

const ACCOUNT_SECTIONS = [
  { id: "perfil", label: "Perfil", icon: UserRound, description: "Tus datos de acceso a Crow." },
  { id: "productora", label: "Productora", icon: Building2, description: "La identidad de tu equipo en Crow." },
  { id: "cobros", label: "Cobros", icon: CreditCard, description: "Administrá las cuentas donde recibís los pagos de tus eventos." },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle, description: "El canal de comunicación con tus clientes y tu equipo." },
  { id: "app", label: "App de escritorio", icon: Monitor, description: "Crow para la computadora de la caja, la barra o la puerta." },
] as const

export function SettingsPage() {
  const mpToastHandled = useRef(false)
  const staff = useAuthStore((s) => s.staff)
  const tenantId = staff?.tenantId ?? null
  const tenantName = staff?.tenantName
  const token = useAuthStore((s) => s.token)
  const updateStaff = useAuthStore((s) => s.updateStaff)
  const [searchParams, setSearchParams] = useSearchParams()
  const [productoraName, setProductoraName] = useState(tenantName ?? "")
  const [savingProductora, setSavingProductora] = useState(false)
  const isAdmin = staff?.role === "ADMIN"
  const restrictedSettings = ["BARTENDER", "SECURITY", "TRANSPORTER", "GENERAL_PROMOTER"].includes(staff?.role ?? "")
  const hasTenant = tenantId != null && tenantId !== ""
  const visibleSections = ACCOUNT_SECTIONS.filter((section) => {
    if (section.id === "app") return !isTauri()
    return !restrictedSettings || section.id === "perfil"
  })
  const requestedSection = searchParams.has("mp_status") ? "cobros" : searchParams.get("tab")
  const activeSection = visibleSections.find((section) => section.id === requestedSection) ?? visibleSections[0]

  useEffect(() => { setProductoraName(tenantName ?? "") }, [tenantName])

  useEffect(() => {
    const mpStatus = searchParams.get("mp_status")
    if (mpStatus !== "success" && mpStatus !== "error") {
      mpToastHandled.current = false
      return
    }
    if (mpToastHandled.current) return
    mpToastHandled.current = true
    if (mpStatus === "success") toast.success("Mercado Pago conectado correctamente")
    else {
      const messages: Record<string, string> = {
        access_denied: "No autorizaste la conexión con Mercado Pago. Podés volver a intentarlo.",
        config_error: "Mercado Pago no está configurado correctamente. Contactá al administrador de Crow.",
        oauth_failed: "Mercado Pago no pudo completar la vinculación. Iniciá la conexión nuevamente.",
      }
      toast.error(messages[searchParams.get("mp_error") ?? ""] ?? "No se pudo conectar Mercado Pago")
    }
    const next = new URLSearchParams(searchParams)
    next.delete("mp_status")
    next.delete("mp_error")
    next.set("tab", "cobros")
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    document.querySelector<HTMLElement>('.account-nav [aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [activeSection.id])

  async function saveProductoraName(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !staff || !hasTenant || !isAdmin) return
    const name = productoraName.trim()
    if (!name) { toast.error("Ingresá el nombre de la productora"); return }
    setSavingProductora(true)
    try {
      const data = await apiFetch<{ tenant: { name: string } }>("/tenants/me", {
        method: "PUT", token, body: JSON.stringify({ name }),
      })
      updateStaff({ ...staff, tenantName: data.tenant.name })
      toast.success("Nombre de la productora actualizado")
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "No se pudo guardar el nombre")
    } finally { setSavingProductora(false) }
  }

  function sectionLink(id: string) {
    const next = new URLSearchParams(searchParams)
    next.delete("mp_status")
    next.delete("mp_error")
    next.set("tab", id)
    return `?${next}`
  }

  return (
    <div className="account-workspace">
      <Header showLogout={false} />
      <main className="account-container">
        <header className="account-page-heading">
          <div>
            <h1>{restrictedSettings ? "Mi perfil" : "Cuenta"}</h1>
            <p>{restrictedSettings ? "Tu perfil y las herramientas para trabajar." : "Tu perfil, tu productora y sus conexiones."}</p>
          </div>
          {hasTenant && !restrictedSettings ? <span className="account-tenant"><Building2 aria-hidden="true" />{tenantName ?? "Tu productora"}</span> : null}
        </header>
        <div className="account-layout">
          <nav className="account-nav" aria-label="Secciones de cuenta">
            {visibleSections.map(({ id, label, icon: Icon }) => (
              <Link key={id} to={sectionLink(id)} aria-current={activeSection.id === id ? "page" : undefined}>
                <Icon aria-hidden="true" /><span>{label}</span>
              </Link>
            ))}
          </nav>
          <div className="account-content">
            <header className="account-content-heading">
              <h2 id="account-section-title">{activeSection.label}</h2>
              <p>{activeSection.description}</p>
            </header>
            {/* Keep forms mounted so switching sections preserves unfinished edits. */}
            <div hidden={activeSection.id !== "perfil"} className="account-panel" aria-labelledby="account-section-title">
              <dl className="account-details">
                <div><dt>Nombre</dt><dd>{staff?.name ?? "—"}</dd></div>
                <div><dt>Correo electrónico</dt><dd>{staff?.email ?? "—"}</dd></div>
                <div><dt>Rol</dt><dd><span className="account-role">{staff ? staffRoleLabel(staff.role) : "—"}</span></dd></div>
              </dl>
              <section className="account-session">
                <div><h3>Sesión</h3><p>Cerrá tu sesión en este dispositivo.</p></div>
                <LogoutButton variant="ghost" className="account-button account-button-secondary" />
              </section>
            </div>
            {!restrictedSettings ? <>
              <div hidden={activeSection.id !== "productora"} className="account-panel" aria-labelledby="account-section-title">
                {hasTenant ? <form onSubmit={saveProductoraName} className="account-productora-form">
                  <label htmlFor="account-productora-name">Nombre de la productora</label>
                  <p id="account-productora-help">Así se identifica tu productora en Crow.</p>
                  <input id="account-productora-name" value={productoraName} onChange={(e) => setProductoraName(e.target.value)} required maxLength={255} autoComplete="organization" readOnly={!isAdmin} aria-describedby="account-productora-help" />
                  {!isAdmin ? <p>Solo un administrador puede cambiar el nombre.</p> : null}
                  <div className="account-form-footer"><button type="submit" disabled={savingProductora || !isAdmin} className="account-button account-button-primary">{savingProductora ? "Guardando…" : "Guardar cambios"}</button></div>
                </form> : isAdmin ? <ProductoraSetupCard variant="account" /> : <ProductoraWaitingCard variant="account" />}
              </div>
              <div hidden={activeSection.id !== "cobros"} className="account-panel" aria-labelledby="account-section-title">
                {hasTenant ? <><MpConnectionCard tenantId={tenantId} token={token} /><CucuruConnectionCard tenantId={tenantId} token={token} /></> : <AccountTenantRequired href={sectionLink("productora")} />}
              </div>
              <div hidden={activeSection.id !== "whatsapp"} className="account-panel" aria-labelledby="account-section-title">
                {hasTenant ? <WhatsAppConnectionCard tenantId={tenantId} token={token} /> : <AccountTenantRequired href={sectionLink("productora")} />}
              </div>
            </> : null}
            {!isTauri() ? <div hidden={activeSection.id !== "app"} className="account-panel" aria-labelledby="account-section-title"><DesktopAppCard /></div> : null}
          </div>
        </div>
      </main>
    </div>
  )
}

function AccountTenantRequired({ href }: { href: string }) {
  return <div className="account-empty"><Building2 aria-hidden="true" /><h3>Primero, tu productora</h3><p>Configurá tu productora para acceder a esta conexión.</p><Link to={href} className="account-button account-button-secondary">Ir a Productora</Link></div>
}
