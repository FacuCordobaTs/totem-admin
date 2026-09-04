import { useState } from "react"
import { toast } from "sonner"
import { apiFetch, ApiError } from "@/lib/api"
import { useAuthStore, type StaffProfile, type StaffRole } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

const ROLES: StaffRole[] = ["ADMIN", "MANAGER", "PROMOTER", "BARTENDER", "SECURITY"]

type Props = {
  onCreated: (keepOpen?: boolean) => void
  className?: string
}

/**
 * Alta de empleado inline (sin modal, al estilo "crear tipo de entrada"). Crea la cuenta en el
 * equipo GLOBAL de la productora vía POST /staff/team; el mismo endpoint importa la persona si ya
 * existe en otra productora.
 */
export function StaffInlineCreate({ onCreated, className }: Props) {
  const token = useAuthStore((s) => s.token)

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState<StaffRole>("BARTENDER")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)

  function reset() {
    setName("")
    setEmail("")
    setPassword("")
    setRole("BARTENDER")
    setError(null)
    setInvitationUrl(null)
  }

  async function create() {
    if (!token || saving) return
    if (name.trim() === "") {
      setError("Completá el nombre.")
      return
    }
    if (role !== "PROMOTER" && (email.trim() === "" || password.length < 8)) {
      setError("Completá nombre, correo y una contraseña de 8+ caracteres.")
      return
    }
    setError(null)
    setSaving(true)
    try {
      if (role === "PROMOTER") {
        const data = await apiFetch<{ invitation: { url: string } }>("/staff/invitations", {
          method: "POST",
          token,
          body: JSON.stringify({ name: name.trim(), role }),
        })
        setInvitationUrl(data.invitation.url)
        onCreated(true)
        toast.success("Promotor creado. Compartí su link de acceso.")
        return
      }
      const data = await apiFetch<{ staff: StaffProfile; imported?: boolean }>("/staff/team", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
        }),
      })
      const createdName = name.trim()
      reset()
      onCreated()
      toast.success(
        data.imported
          ? `${createdName} ya existía en otra Productora y se agregó a la tuya. Mantiene su contraseña.`
          : "Empleado agregado"
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta")
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    "h-11 rounded-xl border-white/[0.12] bg-white/[0.04] text-[14px] text-white placeholder:text-white/35"

  return (
    <form
      className={cn("space-y-4", className)}
      onSubmit={(event) => {
        event.preventDefault()
        void create()
      }}
    >
      <div className="space-y-2">
        <label htmlFor="new-staff-name" className="text-[13px] text-white/60">Nombre</label>
        <Input id="new-staff-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre y apellido" className={inputClass} />
      </div>
      {role !== "PROMOTER" ? <div className="space-y-2">
        <label htmlFor="new-staff-email" className="text-[13px] text-white/60">Correo</label>
        <Input id="new-staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@correo.com" autoComplete="off" className={inputClass} />
      </div> : null}
      {role !== "PROMOTER" ? <div className="space-y-2">
        <label htmlFor="new-staff-password" className="text-[13px] text-white/60">Contraseña</label>
        <Input id="new-staff-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" minLength={8} className={inputClass} />
      </div> : null}
      <div className="space-y-2">
        <span className="text-[13px] text-white/60">Rol</span>
        <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
          <SelectTrigger className={inputClass}><SelectValue /></SelectTrigger>
          <SelectContent className="rounded-xl">
            {ROLES.map((r) => <SelectItem key={r} value={r}>{staffRoleLabel(r)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={saving || name.trim() === "" || invitationUrl != null} className="h-11 w-full rounded-xl bg-[#FF9500] text-[14px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-40">
        {saving ? "Agregando…" : role === "PROMOTER" ? "Crear link de acceso" : "Agregar"}
      </Button>
      {invitationUrl ? <div className="space-y-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3"><p className="text-sm font-medium text-emerald-300">Link personal del promotor</p><p className="text-xs text-white/55">Después asignalo al evento desde Equipo para que pueda vender.</p><Input readOnly value={invitationUrl} className="h-9 border-white/[0.12] bg-black text-xs text-white/70" /><Button type="button" variant="outline" className="h-9 w-full border-white/[0.15]" onClick={() => { void navigator.clipboard.writeText(invitationUrl); toast.success("Link copiado") }}>Copiar link</Button></div> : null}
      {error ? (
        <p className="text-[12px] text-red-400">{error}</p>
      ) : null}
    </form>
  )
}
