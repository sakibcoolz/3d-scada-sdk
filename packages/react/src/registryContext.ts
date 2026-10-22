import { createContext, useContext } from 'react';
import { builtInRegistry, type ComponentRegistry } from '@sakibcoolz/components';

/**
 * The component registry a viewer or editor draws and edits with (ADR-0022). Provided by
 * `Scada3DViewer`/`Scada3DEditor` from their `registry` prop; the built-in kinds by default.
 */
export const RegistryContext = createContext<ComponentRegistry>(builtInRegistry);

export function useRegistry(): ComponentRegistry {
  return useContext(RegistryContext);
}
