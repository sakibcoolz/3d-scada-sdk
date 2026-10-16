import { useEffect, useMemo, useRef, useState } from 'react';
import type { ScadaScene } from '@scada3d/core';
import { createSimulation, type SimulationState } from '@scada3d/simulation';
import { componentCatalog } from '@scada3d/components';

const speeds = [1, 10, 60] as const;
const models = ['mass-balance', 'hydraulic'] as const;
type Model = (typeof models)[number];

/**
 * Host side of `?simulate`: runs the mass-balance model (ADR-0010) on the edited scene and hands
 * its state to the editor's `simulation` prop. The playground owns the clock, as any host would.
 */
export function useSimulation(scene: ScadaScene, enabled: boolean, initialModel: Model = 'mass-balance') {
  const [model, setModel] = useState<Model>(initialModel);
  // A new model starts a new run from the authored levels.
  const sim = useMemo(() => (enabled ? createSimulation(scene, { model }) : undefined), [enabled, model]);
  const [state, setState] = useState<SimulationState | undefined>(() => sim?.state());
  useEffect(() => { if (sim) setState(sim.state()); }, [sim]);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<(typeof speeds)[number]>(10);
  const [feed, setFeed] = useState(0);
  // The first vessel (any tank shape) with a level gets the feed at its inlet.
  const tank = scene.components.find((c) => componentCatalog[c.type].bindable?.level !== undefined);
  const inletFree = tank && !scene.connections.some((c) => [c.from, c.to].some((e) => e.instanceId === tank.id && e.portId === 'inlet'));
  const last = useRef(performance.now());

  useEffect(() => { if (sim) setState(sim.update(scene)); }, [sim, scene]);
  useEffect(() => {
    if (!sim) return;
    setState(sim.configure({ feeds: tank && inletFree && feed > 0 ? [{ at: { instanceId: tank.id, portId: 'inlet' }, rate: feed }] : [] }));
  }, [sim, feed, tank?.id, inletFree]);
  useEffect(() => {
    if (!sim) return;
    last.current = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const elapsed = (now - last.current) / 1000;
      last.current = now;
      // Paused still re-stamps the readings so frozen values do not age into "stale".
      setState(running ? sim.step(Math.min(elapsed, 0.5) * speed) : sim.state());
    }, 100);
    return () => clearInterval(timer);
  }, [sim, running, speed]);

  const panel = sim && state && (
    <div aria-label="Simulation" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', padding: '6px 20px', background: '#1b1530', color: '#e9e0ff', fontFamily: 'system-ui', fontSize: 12 }}>
      <b>Simulation</b>
      <label>Model <select aria-label="Simulation model" value={model} onChange={(e) => setModel(e.target.value as Model)}>{models.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
      <span>{state.model.name} v{state.model.version} · SIMULATED, not plant data</span>
      <button onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Run'}</button>
      <label>Speed <select aria-label="Simulation speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value) as (typeof speeds)[number])}>{speeds.map((s) => <option key={s} value={s}>{s}×</option>)}</select></label>
      <label>Feed into tank inlet (m³/s) <input aria-label="Feed rate" type="number" min={0} step={0.005} value={feed} disabled={!inletFree} style={{ width: 70 }} onChange={(e) => setFeed(Math.max(0, Number(e.target.value) || 0))} /></label>
      <button onClick={() => setState(sim.reset())}>Reset</button>
      <span aria-label="Simulation time">t = {state.time.toFixed(0)} s</span>
      <span aria-label="Simulation totals">fed {state.totals.fed.toFixed(2)} m³ · spilled {state.totals.spilled.toFixed(2)} m³ · in tanks {state.totals.stored.toFixed(2)} m³</span>
      {state.notes.length > 0 && <span aria-label="Simulation notes">{state.notes.map((n) => `${n.kind}: ${n.instanceId}`).join(', ')}</span>}
    </div>
  );
  return { state, panel };
}
