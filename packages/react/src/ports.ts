import { portCapacity, type ConnectionPort, type PortFlow, type PortKind, type ScadaScene } from '@sakibcoolz/core';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';

// The port and terminal inspector's model (ADR-0027, T-087): one row per port of a component, with its
// ratings, how much of its capacity is used and what each connection joins. Pure; no rendering.

/** The other end of one connection. */
export interface PortJoin {
  connectionId: string;
  componentId: string;
  /** The other component's name, else its id. Display text only. */
  componentLabel: string;
  portId: string;
  terminal?: string;
}

export interface PortRow {
  id: string;
  name?: string;
  terminal?: string;
  kind: PortKind;
  /** Short rating text, e.g. "DI", "AI 4–20 mA", "AC 400 V 3-phase in", "ethernet · modbus-tcp, opcua". */
  rating: string;
  used: number;
  capacity: number;
  joins: PortJoin[];
}

/** Which way a port faces: its `flow`, else outputs for DO/AO and inputs for DI/AI. */
export function portFlow(port: ConnectionPort): PortFlow | undefined {
  if (port.flow) return port.flow;
  if (port.signal) return port.signal.type === 'DO' || port.signal.type === 'AO' ? 'out' : 'in';
  return undefined;
}

/** A port's ratings as one short line; empty when it has none. */
export function describeRating(port: ConnectionPort): string {
  const flow = port.kind === 'power' && port.flow ? ` ${port.flow}` : '';
  if (port.signal) {
    const range = port.signal.range ? ` ${port.signal.range[0]}–${port.signal.range[1]}` : '';
    return `${port.signal.type}${range}${port.signal.unit ? ` ${port.signal.unit}` : ''}`;
  }
  if (port.power) {
    if (port.power.kind === 'PE') return 'PE';
    const parts = [port.power.kind, port.power.voltage !== undefined ? `${port.power.voltage} V` : '', port.power.phases ? `${port.power.phases}-phase` : ''].filter(Boolean);
    return `${parts.join(' ')}${flow}`;
  }
  if (port.network) return `${port.network.medium}${port.network.protocols?.length ? ` · ${port.network.protocols.join(', ')}` : ''}`;
  if (port.nominalSize !== undefined) return `bore ${Math.round(port.nominalSize * 1000)} mm`;
  return flow.trim();
}

/** Every port of a component in definition order, with what its connections join. Empty for an unknown id. */
export function describePorts(scene: ScadaScene, componentId: string, registry: ComponentRegistry = builtInRegistry): PortRow[] {
  const component = scene.components.find((c) => c.id === componentId);
  if (!component) return [];
  const byId = new Map(scene.components.map((c) => [c.id, c]));
  const portOf = (instanceId: string, portId: string) => {
    const c = byId.get(instanceId);
    return c && registry.definitionFor(c.type, c.properties).ports.find((p) => p.id === portId);
  };
  return registry.definitionFor(component.type, component.properties).ports.map((port) => {
    const joins: PortJoin[] = [];
    for (const c of scene.connections) {
      for (const [self, other] of [[c.from, c.to], [c.to, c.from]] as const) {
        if (self.instanceId !== componentId || self.portId !== port.id) continue;
        const otherComponent = byId.get(other.instanceId);
        const otherPort = portOf(other.instanceId, other.portId);
        joins.push({
          connectionId: c.id,
          componentId: other.instanceId,
          componentLabel: otherComponent?.name ?? other.instanceId,
          portId: other.portId,
          ...(otherPort?.terminal ? { terminal: otherPort.terminal } : {}),
        });
      }
    }
    return {
      id: port.id,
      ...(port.name ? { name: port.name } : {}),
      ...(port.terminal ? { terminal: port.terminal } : {}),
      kind: port.kind,
      rating: describeRating(port),
      used: joins.length,
      capacity: portCapacity(port),
      joins,
    };
  });
}
