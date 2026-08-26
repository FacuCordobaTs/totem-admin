import { useState } from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"
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

const ROLES: StaffRole[] = ["ADMIN", "MANAGER", "BARTENDER", "SECURITY"]

type Props = {
  onCreated: () => void
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

  function reset() {
    setName("")
    setEmail("")
    setPassword("")
    setRole("BARTENDER")
    setError(null)
  }

  async function create() {
    if (!token || saving) return
    if (name.trim() === "" || email.trim() === "" || password.length < 8) {
      setError("Completá nombre, correo y una contraseña de 8+ caracteres.")
      return
    }
    setError(null)
    setSaving(true)
    try {
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
    "h-10 rounded-lg border-zinc-200/60 bg-background text-[14px] dark:border-zinc-800/60"

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-zinc-300/80 p-2 dark:border-white/[0.14]">
        <Plus className="ml-1 h-4 w-4 shrink-0 text-zinc-400 dark:text-white/30" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre"
          className={cn(inputClass, "min-w-[120px] flex-1")}
        />
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Correo"
          autoComplete="off"
          className={cn(inputClass, "min-w-[160px] flex-1")}
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoComplete="new-password"
          minLength={8}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create()
          }}
          className={cn(inputClass, "min-w-[140px] flex-1")}
        />
        <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
          <SelectTrigger className={cn(inputClass, "w-[130px] shrink-0")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {staffRoleLabel(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={() => void create()}
          disabled={saving || name.trim() === ""}
          className="h-10 shrink-0 rounded-lg bg-[#FF9500] px-4 text-[14px] font-semibold text-white hover:bg-[#FF9500]/90 disabled:opacity-40"
        >
          {saving ? "…" : "Agregar"}
        </Button>
      </div>
      {error ? (
        <p className="px-1 text-[12px] text-red-500 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  )
}
