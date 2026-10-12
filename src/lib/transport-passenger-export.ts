import Decimal from "decimal.js"

export type TransportPassengerBooking = {
  id: string
  transportId: string
  name: string
  address?: string
  quantity: number
  price: string
  customerName: string
  customerDni: string | null
  customerPhone: string | null
}

function csvCell(value: string | number | null | undefined) {
  let text = String(value ?? "")
  if (/^\s*[=+\-@]/.test(text)) text = "'" + text
  return `"${text.replace(/"/g, '""')}"`
}

export function transportPassengerCsv(bookings: TransportPassengerBooking[]) {
  const rows: (string | number | null | undefined)[][] = [
    [
      "Transporte",
      "Dirección",
      "Comprador",
      "DNI",
      "Celular",
      "Pasajes",
      "Precio por pasaje",
      "Total"
    ],
    ...bookings.map((b) => [
      b.name,
      b.address,
      b.customerName,
      b.customerDni,
      b.customerPhone,
      b.quantity,
      b.price,
      new Decimal(b.price).mul(b.quantity).toFixed(2)
    ])
  ]
  return "\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n")
}

export function downloadTransportPassengers(
  bookings: TransportPassengerBooking[],
  filename: string
) {
  const url = URL.createObjectURL(
    new Blob([transportPassengerCsv(bookings)], {
      type: "text/csv;charset=utf-8"
    })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
