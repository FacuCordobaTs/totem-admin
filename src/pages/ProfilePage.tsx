import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuthStore } from "@/stores/auth-store"
import { staffRoleLabel } from "@/lib/role-labels"

export function ProfilePage() {
  const staff = useAuthStore((s) => s.staff)

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 lg:pl-16">
        <Header />
        <div className="p-4 lg:p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">Perfil</h1>
            <p className="text-sm text-muted-foreground">
              Datos de tu cuenta en Totem
            </p>
          </div>

          <Card className="max-w-lg border-border">
            <CardHeader>
              <CardTitle>Información de la cuenta</CardTitle>
              <CardDescription>
                Estos datos se muestran en el panel y en operaciones auditadas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Nombre
                </p>
                <p className="text-base">{staff?.name ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Correo
                </p>
                <p className="text-base">{staff?.email ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Rol
                </p>
                <p className="text-base">
                  {staff ? staffRoleLabel(staff.role) : "—"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
