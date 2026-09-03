import { useEffect, useState } from "react"
import { Navigate, useNavigate } from "react-router"
import { CreditCard, ScanLine } from "lucide-react"
import { useAuthStore } from "@/stores/auth-store"

const MOBILE_BREAKPOINT = "(max-width: 767px)"

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(MOBILE_BREAKPOINT).matches
  )

  useEffect(() => {
    const media = window.matchMedia(MOBILE_BREAKPOINT)
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return isMobile
}

/**
 * Entrada para operaciones desde teléfonos. El POS y el control de acceso son
 * flujos independientes, por lo que se elige uno antes de inicializar alguno.
 */
export function MobileOperationsPage() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.staff?.role)
  const isMobile = useIsMobile()

  if (!isMobile) {
    return <Navigate to="/pos/venta" replace />
  }

  if (role === "SECURITY") {
    return <Navigate to="/scanner" replace />
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[#F2F2F7] px-5 py-[max(1.5rem,env(safe-area-inset-top))] text-black dark:bg-black dark:text-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-10 text-center">
          <img
            src="/logo.png"
            alt="Crow"
            className="mx-auto h-16 w-16 rounded-2xl object-cover"
          />
          <h1 className="mt-6 text-3xl font-bold tracking-tight">¿Qué vas a usar?</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6D6D72] dark:text-[#98989D]">
            Elegí el módulo para esta operación.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => navigate("/pos/venta", { replace: true })}
            className="flex min-h-32 w-full items-center gap-5 rounded-3xl bg-white p-6 text-left shadow-sm transition-transform active:scale-[0.98] dark:bg-[#1C1C1E]"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FF9500]/15 text-[#FF9500]">
              <CreditCard className="h-7 w-7" />
            </span>
            <span>
              <span className="block text-xl font-bold">POS</span>
              <span className="mt-1 block text-[14px] leading-snug text-[#6D6D72] dark:text-[#98989D]">
                Cobrar ventas y gestionar consumiciones.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/pos/escaner", { replace: true })}
            className="flex min-h-32 w-full items-center gap-5 rounded-3xl bg-white p-6 text-left shadow-sm transition-transform active:scale-[0.98] dark:bg-[#1C1C1E]"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 text-violet-500">
              <ScanLine className="h-7 w-7" />
            </span>
            <span>
              <span className="block text-xl font-bold">Escáner de barra</span>
              <span className="mt-1 block text-[14px] leading-snug text-[#6D6D72] dark:text-[#98989D]">
                Canjear consumiciones y entregar pedidos.
              </span>
            </span>
          </button>
        </div>
      </div>
    </main>
  )
}
