import { useCallback, useEffect, useRef, useState } from 'react';
import { PlantCanvas } from './components/PlantCanvas';
import { StatsBar } from './components/StatsBar';
import { Toolbar } from './components/Toolbar';
import { LotPanel } from './components/LotPanel';
import { RoomPanel } from './components/RoomPanel';
import { LogPanel } from './components/LogPanel';
import { ThemeSwitch } from './components/ThemeSwitch';
import { PlantStore, usePlantSnapshot } from './store/plantStore';
import { plantData, usingDemoPlant } from './data/plant';
import type { PlantEngine } from './engine';
import type { PlantData } from './engine/types';

const DATA = plantData as unknown as PlantData;

export default function App() {
  // Un único store por sesión; el motor lo alimenta a ~4 Hz.
  const storeRef = useRef<PlantStore>(null);
  storeRef.current ??= new PlantStore();
  const store = storeRef.current;

  const engineRef = useRef<PlantEngine | null>(null);
  const [roomOptions, setRoomOptions] = useState<{ id: string; name: string }[]>([]);

  const onReady = useCallback((engine: PlantEngine) => {
    engineRef.current = engine;
    setRoomOptions(engine.roomOptions());
  }, []);

  // El título de la pestaña sale del plano cargado, no está fijado en el HTML.
  useEffect(() => { document.title = DATA.meta.name; }, []);

  const snapshot = usePlantSnapshot(store);
  const incidentRoom = DATA.rooms.find((r) => r.id === DATA.incident.room)?.short ?? '';

  return (
    <main className="app">
      <header className="top">
        <div>
          <p className="eyebrow">{DATA.meta.level} · plano de instalación</p>
          <h1>{DATA.meta.name}</h1>
        </div>
        <div className="meta">
          <ThemeSwitch />
          <span className="badge">
            {usingDemoPlant ? 'Planta ficticia · datos de ejemplo' : 'Prototipo · datos de ejemplo'}
          </span>
          <span className="clock">Turno de mañana · {snapshot?.clock ?? '08:00'}</span>
        </div>
      </header>

      {snapshot && <StatsBar stats={snapshot.stats} />}

      <section className="stage-card" aria-label="Plano isométrico de la planta baja">
        <Toolbar
          legend={DATA.legend}
          view={snapshot?.view ?? { zoom: 1, atFit: true, atMax: false }}
          onZoomIn={() => engineRef.current?.zoomIn()}
          onZoomOut={() => engineRef.current?.zoomOut()}
          onResetView={() => engineRef.current?.resetView()}
          tourActive={snapshot?.tour.active ?? false}
          onTour={() => {
            const e = engineRef.current;
            if (!e) return;
            if (snapshot?.tour.active) e.stopTour(); else e.startTour();
          }}
          playing={snapshot?.playing ?? true}
          speed={snapshot?.speed ?? 1}
          incident={snapshot?.incident ?? { on: false, containing: false }}
          incidentRoom={incidentRoom}
          onTogglePlaying={() => engineRef.current?.togglePlaying()}
          onSpeed={(v) => engineRef.current?.setSpeed(v)}
          onToggleIncident={() => engineRef.current?.toggleIncident()}
        />
        <PlantCanvas
          store={store}
          onReady={onReady}
          tour={snapshot?.tour ?? { active: false, index: 0, total: 0, title: '', text: '', progress: 0 }}
          onTourPrev={() => engineRef.current?.tourGo((snapshot?.tour.index ?? 0) - 1)}
          onTourNext={() => engineRef.current?.tourGo((snapshot?.tour.index ?? 0) + 1)}
          onTourExit={() => engineRef.current?.stopTour()}
        />
      </section>

      {snapshot && (
        <section className="lower">
          <LotPanel
            snapshot={snapshot}
            stages={DATA.lot.stages}
            onFocusLot={(id) => engineRef.current?.focusLot(id)}
          />
          <RoomPanel
            room={snapshot.room}
            options={roomOptions}
            onSelect={(id) => engineRef.current?.selectRoom(id)}
          />
          <LogPanel log={snapshot.log} />
        </section>
      )}

      <p className="note">
        Distribución, superficies y circuitos tomados del plano. Lotes, sensores y cifras son
        inventados para probar el concepto.
      </p>
    </main>
  );
}
