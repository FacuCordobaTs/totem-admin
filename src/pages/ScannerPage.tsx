import { useState } from "react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { CheckCircle, XCircle, Scan, Users, ChevronLeft } from "lucide-react"
import { cn } from "@/lib/utils"

type ScanState = "idle" | "scanning" | "success" | "error"

interface ScanResult {
  type: "success" | "error"
  name?: string
  ticketType?: string
  message?: string
}

const mockResults: ScanResult[] = [
  { type: "success", name: "Juan Pérez", ticketType: "Entrada general" },
  { type: "success", name: "Sara Jiménez", ticketType: "VIP" },
  { type: "error", message: "QR YA UTILIZADO" },
  { type: "success", name: "Miguel Chen", ticketType: "Mesa VIP" },
  { type: "error", message: "ENTRADA NO VÁLIDA" },
  { type: "success", name: "Emma Williams", ticketType: "Entrada general" },
]

export function ScannerPage() {
  const [scanState, setScanState] = useState<ScanState>("idle")
  const [result, setResult] = useState<ScanResult | null>(null)
  const [checkedIn, setCheckedIn] = useState(623)
  const totalExpected = 847

  const handleScan = () => {
    setScanState("scanning")

    setTimeout(() => {
      const randomResult = mockResults[Math.floor(Math.random() * mockResults.length)]
      setResult(randomResult)
      setScanState(randomResult.type)

      if (randomResult.type === "success") {
        setCheckedIn((prev) => prev + 1)
      }

      setTimeout(() => {
        setScanState("idle")
        setResult(null)
      }, 2500)
    }, 800)
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <Link
          to="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="text-center">
          <h1 className="text-sm font-medium">Festival Noches Neón</h1>
          <p className="text-xs text-muted-foreground">Escáner de acceso</p>
        </div>
        <div className="w-8" />
      </header>

      <div className="flex items-center justify-center gap-3 border-b border-border bg-secondary/30 px-4 py-3">
        <Users className="h-5 w-5 text-primary" />
        <div className="text-center">
          <span className="text-2xl font-bold">{checkedIn}</span>
          <span className="mx-1 text-muted-foreground">/</span>
          <span className="text-lg text-muted-foreground">{totalExpected}</span>
        </div>
        <span className="text-sm text-muted-foreground">Registrados</span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6">
        <div
          className={cn(
            "relative flex aspect-square w-full max-w-xs items-center justify-center rounded-2xl border-2 transition-all duration-300",
            scanState === "idle" && "border-dashed border-border",
            scanState === "scanning" && "border-primary animate-pulse",
            scanState === "success" && "border-primary bg-primary/10",
            scanState === "error" && "border-destructive bg-destructive/10"
          )}
        >
          <div className="absolute left-4 top-4 h-8 w-8 border-l-2 border-t-2 border-primary" />
          <div className="absolute right-4 top-4 h-8 w-8 border-r-2 border-t-2 border-primary" />
          <div className="absolute bottom-4 left-4 h-8 w-8 border-b-2 border-l-2 border-primary" />
          <div className="absolute bottom-4 right-4 h-8 w-8 border-b-2 border-r-2 border-primary" />

          {scanState === "idle" && (
            <div className="text-center">
              <Scan className="mx-auto h-16 w-16 text-muted-foreground" />
              <p className="mt-4 text-sm text-muted-foreground">
                Coloca el código QR en el marco
              </p>
            </div>
          )}

          {scanState === "scanning" && (
            <div className="text-center">
              <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="mt-4 text-sm text-muted-foreground">Leyendo...</p>
            </div>
          )}

          {scanState === "success" && result && (
            <div className="text-center px-4">
              <CheckCircle className="mx-auto h-20 w-20 text-primary" />
              <p className="mt-4 text-lg font-semibold text-primary">¡BIENVENIDO!</p>
              <p className="mt-2 text-xl font-bold">{result.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.ticketType}
              </p>
            </div>
          )}

          {scanState === "error" && result && (
            <div className="text-center px-4">
              <XCircle className="mx-auto h-20 w-20 text-destructive" />
              <p className="mt-4 text-lg font-semibold text-destructive">ERROR</p>
              <p className="mt-2 text-base font-medium">{result.message}</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-6">
        <Button
          onClick={handleScan}
          disabled={scanState === "scanning"}
          className={cn(
            "h-16 w-full text-lg font-semibold transition-all",
            scanState === "idle" && "bg-primary text-primary-foreground hover:bg-primary/90",
            scanState === "scanning" && "bg-secondary text-secondary-foreground",
            scanState === "success" && "bg-primary text-primary-foreground",
            scanState === "error" && "bg-destructive text-destructive-foreground"
          )}
        >
          {scanState === "idle" && (
            <>
              <Scan className="mr-3 h-6 w-6" />
              Escanear QR
            </>
          )}
          {scanState === "scanning" && "Leyendo..."}
          {scanState === "success" && (
            <>
              <CheckCircle className="mr-3 h-6 w-6" />
              Entrada válida
            </>
          )}
          {scanState === "error" && (
            <>
              <XCircle className="mr-3 h-6 w-6" />
              No válida
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
