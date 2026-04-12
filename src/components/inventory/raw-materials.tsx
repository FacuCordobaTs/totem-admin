import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Search, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export interface RawMaterial {
  id: string
  name: string
  unit: string
  currentStock: number
  minStock: number
  maxStock: number
}

interface RawMaterialsProps {
  materials: RawMaterial[]
  selectedId: string | null
  onSelect: (id: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
}

function getStockStatus(current: number, min: number, _max: number) {
  if (current <= min * 0.5) return "critical"
  if (current <= min) return "low"
  return "ok"
}

function getStockColor(status: string) {
  switch (status) {
    case "critical":
      return "text-destructive"
    case "low":
      return "text-amber-500"
    default:
      return "text-primary"
  }
}

export function RawMaterials({
  materials,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
}: RawMaterialsProps) {
  const filteredMaterials = materials.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <Card className="flex h-full flex-col border-border bg-card">
      <CardHeader className="shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Materias primas</CardTitle>
          <Button size="sm" variant="outline">
            <Plus className="mr-2 h-4 w-4" />
            Añadir
          </Button>
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar materiales..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="bg-secondary pl-10"
          />
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">Nombre</TableHead>
              <TableHead className="text-muted-foreground">Unidad</TableHead>
              <TableHead className="text-right text-muted-foreground">
                Stock
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMaterials.map((material) => {
              const status = getStockStatus(
                material.currentStock,
                material.minStock,
                material.maxStock
              )
              const isSelected = selectedId === material.id

              return (
                <TableRow
                  key={material.id}
                  onClick={() => onSelect(material.id)}
                  className={cn(
                    "cursor-pointer border-border transition-colors",
                    isSelected
                      ? "bg-primary/10 hover:bg-primary/10"
                      : "hover:bg-secondary/50"
                  )}
                >
                  <TableCell className="font-medium">{material.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {material.unit}
                  </TableCell>
                  <TableCell className={cn("text-right", getStockColor(status))}>
                    {material.currentStock}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span>OK</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Bajo</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-destructive" />
            <span>Crítico</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
