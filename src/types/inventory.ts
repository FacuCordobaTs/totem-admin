/** Cómo se vende un producto: trago, botellas, por unidad o sin control de stock. */
export type ProductSaleType = "GLASS" | "BOTTLE" | "UNIT" | "NONE"

/** Insumo del catálogo: sólo nombre; siempre se cuenta en unidades. */
export interface ApiInventoryItem {
  id: string
  name: string
  /** ISO. Los listados de insumos van del más reciente al más viejo. */
  createdAt?: string | null
}

export interface ApiProductRecipeLine {
  id: string
  inventoryItemId: string
  /** Unidades del insumo que consume una venta (1/N en tragos, K en botellas). */
  quantityUsed: string
  /** Trago: cuántas ventas terminan una unidad del insumo. */
  yieldPerPackage?: string | null
  inventoryItemName: string
}

export interface ApiProductCategory {
  id: string
  name: string
  sortOrder: number
}

export interface ApiProduct {
  id: string
  name: string
  price: string
  isActive: boolean | null
  saleType?: ProductSaleType
  imageUrl?: string | null
  categoryId?: string | null
  recipes: ApiProductRecipeLine[]
}
