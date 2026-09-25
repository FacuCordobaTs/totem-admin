import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

/**
 * Barra fijada a ESTA computadora desde el QR de vinculación de equipo: quien escanea (ADMIN o
 * MANAGER) elige cuál puesto es el dispositivo y esa elección queda guardada acá.
 *
 * Es la fijación del puesto, no una sesión: sobrevive al logout (persistido en localStorage), así
 * que el siguiente que entra en esta computadora —aunque sea un BARTENDER con email y contraseña—
 * abre el POS ya fijado a esa barra, y sólo se cambia reasignando con otro QR.
 *
 * No reemplaza a `crow-pos-session`: esa es la sesión de puesto por PIN, con un `token` que existe
 * como fila en `pos_sessions`. Acá no hay token ni fila: es el puesto recordado del dispositivo.
 */
export type PosAssignedShift = {
  eventId: string
  eventName: string
  barId: string
  barName: string
}

type PosAssignmentState = {
  assignment: PosAssignedShift | null
  setAssignment: (a: PosAssignedShift) => void
  clear: () => void
}

export const usePosAssignmentStore = create<PosAssignmentState>()(
  persist(
    (set) => ({
      assignment: null,
      setAssignment: (assignment) => set({ assignment }),
      clear: () => set({ assignment: null }),
    }),
    {
      name: "crow-pos-assignment",
      storage: createJSONStorage(() => localStorage),
    }
  )
)
