import { useEffect } from "react"
import { toast } from "sonner"
import { usePosOffline } from "@/hooks/usePosOffline"
import { usePrinter } from "@/context/PrinterContext"
import { printPosSale, subscribePosQueue } from "@/lib/pos-offline"

// Mounted above the router: sending keeps working after leaving the POS screen.
export function PosQueueWorker() {
  const { sales, sync } = usePosOffline()
  const { printRaw, selectedPrinter } = usePrinter()
  useEffect(() => {
    void sync()
    const interval = window.setInterval(() => void sync(), 15000)
    const unsubscribe = subscribePosQueue(() => void sync())
    return () => { clearInterval(interval); unsubscribe() }
  }, [sync])
  useEffect(() => {
    if (!selectedPrinter) return
    for (const sale of sales.filter((row) => row.printStatus === "pending" && row.documents.length)) {
      void printPosSale(sale, printRaw).catch((error) => toast.error(`Venta guardada; impresión pendiente: ${error instanceof Error ? error.message : String(error)}`))
    }
  }, [sales, printRaw, selectedPrinter])
  return null
}
