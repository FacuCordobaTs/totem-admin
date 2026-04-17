import { Link } from "react-router"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"

export function GlobalMetricsPage() {
  return (
    <div className="flex min-h-screen bg-[#F2F2F7] dark:bg-black">
      <Sidebar />
      <main className="flex min-h-screen flex-1 flex-col lg:pl-[4.25rem]">
        <Header />
        <div className="flex-1 px-6 py-10 lg:px-10 lg:py-12">
          <div className="mx-auto max-w-lg space-y-10">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  Métricas
                </h1>
                <p className="text-sm text-[#8E8E93] dark:text-[#98989D]">
                  Próximamente.
                </p>
              </div>
              <Button variant="ghost" className="h-10 gap-1 rounded-xl px-3 text-[#8E8E93] hover:text-foreground dark:text-[#98989D]" asChild>
                <Link to="/" className="inline-flex items-center">
                  <ChevronLeft className="h-4 w-4" />
                  Inicio
                </Link>
              </Button>
            </div>

            <div className="rounded-2xl bg-white p-8 dark:bg-[#1C1C1E]">
              <p className="text-[15px] leading-relaxed text-[#8E8E93] dark:text-[#98989D]">
                El resumen de entradas está en la pantalla de inicio.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
