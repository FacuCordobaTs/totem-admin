export type EventSummaryResponse = {
  ticketsSold: number
  totalRevenue: string
  digitalConsumptionsSold: number
}

export type EventBarSalesItem = {
  productName: string
  quantitySold: number
  revenue: string
}

export type EventBarSalesResponse = {
  items: EventBarSalesItem[]
}

export type EventGateStatsResponse = {
  totalTickets: number
  scannedTickets: number
}

export type StaffTeamMember = {
  id: string
  tenantId: string | null
  name: string
  email: string
  role: "ADMIN" | "MANAGER" | "BARTENDER" | "SECURITY"
  isActive: boolean
  createdAt: Date | string | null
}

export type StaffTeamResponse = {
  staff: StaffTeamMember[]
}

export type EventMenuProductRow = {
  id: string
  name: string
  price: string
  catalogIsActive: boolean | null
  isActiveForEvent: boolean
  priceOverride: string | null
}

export type EventMenuProductsResponse = {
  products: EventMenuProductRow[]
}

export type EventBarRow = {
  id: string
  eventId: string
  tenantId: string
  name: string
  isActive: boolean | null
  createdAt: Date | string | null
  updatedAt: Date | string | null
  staffCount: number
  productCount: number
  /** Sum of bar_inventory.currentStock for this bar (decimal string). */
  totalStock: string
  /** Sum of completed sale totals attributed to this bar (decimal string). */
  totalSales: string
}

export type EventBarsResponse = {
  bars: EventBarRow[]
}

export type EventAssignmentStaffRow = {
  id: string
  name: string
  email: string
  role: "ADMIN" | "MANAGER" | "BARTENDER" | "SECURITY"
  isAssigned: boolean
  barId: string | null
}

export type EventStaffListResponse = {
  staff: EventAssignmentStaffRow[]
}

export type BarMenuProductRow = {
  id: string
  name: string
  price: string
  isActiveForBar: boolean
}

export type BarMenuProductsApiResponse = {
  products: BarMenuProductRow[]
}

export type BarInventoryItemRow = {
  inventoryItemId: string
  name: string
  unit: "ML" | "UNIDAD" | "GRAMOS"
  eventStockAllocated: string
  barInventoryRowId: string | null
  barCurrentStock: string
}

export type BarInventoryApiResponse = {
  items: BarInventoryItemRow[]
}

export type EventExpenseCategory =
  | "MUSIC"
  | "LIGHTS"
  | "FOOD"
  | "STAFF"
  | "MARKETING"
  | "INFRASTRUCTURE"
  | "OTHER"

export type EventExpenseRow = {
  id: string
  eventId: string
  tenantId: string
  description: string
  category: EventExpenseCategory
  amount: string
  date: Date | string | null
  createdAt: Date | string | null
}

export type EventExpensesResponse = {
  expenses: EventExpenseRow[]
}

export type EventSaleRowApi = {
  id: string
  createdAt: Date | string | null
  source: "POS" | "APP" | "WEB"
  totalAmount: string
  paymentMethod: "CASH" | "CARD" | "MERCADOPAGO" | "TRANSFER"
  staffName: string | null
  customerName: string | null
  itemsSummary: string
}

export type EventSalesPageResponse = {
  sales: EventSaleRowApi[]
  hasMore: boolean
  limit: number
  offset: number
}

export type InventoryBreakdownBarRow = {
  barName: string
  stock: string
}

export type InventoryBreakdownItemRow = {
  inventoryItemId: string
  itemName: string
  unit: "ML" | "UNIDAD" | "GRAMOS"
  /** Stock total asignado al evento (pool del evento). */
  stockAllocated: string
  /** Suma del stock físico declarado en las barras. */
  totalInBars: string
  bars: InventoryBreakdownBarRow[]
}

export type EventInventoryBreakdownResponse = {
  items: InventoryBreakdownItemRow[]
}
