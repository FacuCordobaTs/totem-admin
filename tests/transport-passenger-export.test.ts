import { describe, expect, test } from "bun:test"
import { transportPassengerCsv } from "../src/lib/transport-passenger-export"

describe("exportación de pasajeros", () => {
  test("exporta pasajes y montos exactos con BOM y escape de CSV", () => {
    const csv = transportPassengerCsv([{ id: "booking-a", transportId: "transport-a", name: "Salida", address: "Av. 7 de Marzo", customerName: 'Ana "López"', customerDni: "12345678", customerPhone: "+541155550000", quantity: 3, price: "18000.10" }])
    expect(csv.startsWith("\ufeff")).toBe(true)
    expect(csv).toContain('"Ana ""López"""')
    expect(csv).toContain('"54000.30"')
    expect(csv).toContain('"\'+541155550000"')
  })
  test("los nombres no pueden introducir fórmulas de planilla", () => {
    const csv = transportPassengerCsv([{ id: "booking-a", transportId: "transport-a", name: "=1+1", customerName: "@SUM(1)", customerDni: null, customerPhone: null, quantity: 1, price: "1.00" }])
    expect(csv).toContain('"\'=1+1"')
    expect(csv).toContain('"\'@SUM(1)"')
  })
})
