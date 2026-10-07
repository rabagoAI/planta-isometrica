import { useEffect, useRef, useState } from 'react';
import { PlantEngine } from '../engine';
import { TourOverlay } from './TourOverlay';
import type { PlantSnapshot } from '../engine/types';
import type { PlantStore } from '../store/plantStore';

interface HoverInfo { name: string; state: string; x: number; y: number }

interface Props {
  store: PlantStore;
  /** Recibe el motor una vez montado, para que los controles lo manejen. */
  onReady: (engine: PlantEngine) => void;
  tour: PlantSnapshot['tour'];
  onTourPrev: () => void;
  onTourNext: () => void;
  onTourExit: () => void;
}

/**
 * Monta el canvas y arranca el motor. El bucle requestAnimationFrame vive
 * dentro del motor: este componente solo gestiona el montaje y el tooltip.
 */
export function PlantCanvas({ store, onReady, tour, onTourPrev, onTourNext, onTourExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    const engine = new PlantEngine({
      canvas,
      viewport,
      onSnapshot: store.set,
      onHover: setHover,
    });
    onReady(engine);
    // En desarrollo, a mano desde la consola: __planta.setTilt(0.32)
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__planta = engine;
    return () => engine.destroy();
    // El motor se monta una sola vez; store y onReady son estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="scroll" ref={viewportRef}>
      <canvas
        ref={canvasRef}
        role="img"
        tabIndex={0}
        aria-label="Plano isométrico de la planta baja con un lote recorriendo el circuito desde materia prima hasta cuarentena. Flechas para desplazar, más y menos para acercar, Escape para ver el plano entero."
      />
      {hover && !tour.active && (
        <div className="tip" style={{ left: hover.x, top: hover.y }}>
          {hover.name} · {hover.state}
        </div>
      )}
      <TourOverlay tour={tour} onPrev={onTourPrev} onNext={onTourNext} onExit={onTourExit} />
    </div>
  );
}
