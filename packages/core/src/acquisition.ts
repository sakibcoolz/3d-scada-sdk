import type { DataType, RuntimeVariable, ScadaScene, SceneDataSource, VariableAddress } from './scene.js';

/** One tag a host's gateway acquires (ADR-0024). */
export interface AcquisitionVariable {
  tagId: string;
  dataSourceId: string;
  dataType: DataType;
  unit?: string;
  variable?: string;
  address?: VariableAddress;
  scaling?: RuntimeVariable['scaling'];
  access: RuntimeVariable['access'];
  /** A writable variable's limits (ADR-0029). The gateway must enforce them itself. */
  command?: RuntimeVariable['command'];
}

/** Everything a gateway needs to acquire a scene's tags, and nothing it does not: no geometry, views or labels. */
export interface AcquisitionPlan {
  /** The scene's `project.revision`, so a host can tie a deployed configuration to an approved document. */
  sourceRevision?: string;
  dataSources: SceneDataSource[];
  /** Variables with a source, in scene order. */
  variables: AcquisitionVariable[];
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * The acquisition description of a validated scene (ADR-0024). Pure and deterministic: the same
 * scene always gives the same plan, in authored order. The SDK never sends it anywhere; the host
 * approves, signs and deploys it, and owns connectivity and credentials.
 */
export function projectAcquisition(scene: ScadaScene): AcquisitionPlan {
  const variables: AcquisitionVariable[] = [];
  for (const v of scene.runtimeVariables ?? []) {
    if (!v.source) continue;
    variables.push({
      tagId: v.id,
      dataSourceId: v.source.dataSourceId,
      dataType: v.dataType,
      ...(v.unit !== undefined ? { unit: v.unit } : {}),
      ...(v.source.variable !== undefined ? { variable: v.source.variable } : {}),
      ...(v.source.address !== undefined ? { address: copy(v.source.address) } : {}),
      ...(v.scaling ? { scaling: { ...v.scaling } } : {}),
      access: v.access,
      ...(v.command ? { command: { ...v.command } } : {}),
    });
  }
  return {
    ...(scene.project?.revision !== undefined ? { sourceRevision: scene.project.revision } : {}),
    dataSources: (scene.dataSources ?? []).map(copy),
    variables,
  };
}
