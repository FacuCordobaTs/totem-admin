import { useEffect, useRef } from "react";
import type { EventBarRow } from "@/types/event-dashboard";

type Props = {
  bars: EventBarRow[];
  activeBarId: string;
  onSelect: (barId: string) => void;
};

/**
 * Navegador horizontal entre las barras del evento. Evita volver al listado para cambiar de
 * puesto y mantiene el foco de teclado usando el patrón de tabs con selección roving.
 */
export function BarSwitcher({ bars, activeBarId, onSelect }: Props) {
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const element = activeRef.current;
    const container = element?.parentElement;
    if (!element || !container) return;
    const itemRect = element.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (itemRect.left < containerRect.left) {
      container.scrollLeft -= containerRect.left - itemRect.left;
    } else if (itemRect.right > containerRect.right) {
      container.scrollLeft += itemRect.right - containerRect.right;
    }
  }, [activeBarId, bars.length]);

  function selectAt(index: number) {
    const next = bars[index];
    if (!next) return;
    onSelect(next.id);
    requestAnimationFrame(() => {
      document.getElementById(`bar-tab-${next.id}`)?.focus();
    });
  }

  return (
    <nav
      className="bw-bar-tabs"
      aria-label="Cambiar de barra"
    >
      {bars.map((bar, index) => {
        const selected = bar.id === activeBarId;
        const inactive = bar.isActive === false;
        return (
          <button
            key={bar.id}
            id={`bar-tab-${bar.id}`}
            type="button"
            aria-current={selected ? "page" : undefined}
            ref={selected ? activeRef : undefined}
            title={`${bar.name}${inactive ? " · inactiva" : ""}`}
            className="bw-bar-tab"
            onClick={() => onSelect(bar.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                selectAt((index + 1) % bars.length);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                selectAt((index - 1 + bars.length) % bars.length);
              } else if (event.key === "Home") {
                event.preventDefault();
                selectAt(0);
              } else if (event.key === "End") {
                event.preventDefault();
                selectAt(bars.length - 1);
              }
            }}
          >
            <span
              className={`bw-bar-tab-dot ${inactive ? "inactive" : ""}`}
              aria-hidden="true"
            />
            <span className="bw-bar-tab-name">{bar.name}</span>
            {inactive ? <span className="bw-bar-tab-meta">Inactiva</span> : null}
          </button>
        );
      })}
    </nav>
  );
}
