import React, { useRef, useState } from 'react';
import { createEmptyScene, type ScadaScene } from '@sakibcoolz/core';
import { ElectricalView, ProcessView } from '@sakibcoolz/views-2d';
import { Scada3DEditor, type ScadaHandle } from './index.js';

// One document, one selection, several views (ADR-0026): the 3D editor and the 2D process and
// electrical diagrams. The editor owns the scene and its history; a symbol dragged in 2D is committed
// to that history through `setViews`, so it undoes, saves and respects the edit lock like any edit.

export type WorkspaceLayout = '3d' | 'process' | 'electrical' | 'split';
type Diagram = 'process' | 'electrical';

type EditorProps = Parameters<typeof Scada3DEditor>[0];

export type ScadaWorkspaceProps = Omit<EditorProps, 'selectedIds' | 'onSelectionChange' | 'ref'> & {
  /** Controlled layout; without it the workspace keeps its own, starting at `defaultLayout`. */
  layout?: WorkspaceLayout;
  /** Default 'split'. */
  defaultLayout?: WorkspaceLayout;
  onLayoutChange?: (layout: WorkspaceLayout) => void;
  /** Which diagram the split layout shows beside 3D. Default 'process'. */
  defaultDiagram?: Diagram;
  /** Controlled selection, shared by every view. Never saved into the scene. */
  selectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  /** Handle of the editor inside, e.g. to push tag values. */
  editorRef?: React.Ref<ScadaHandle>;
  style?: React.CSSProperties;
};

const layouts: [WorkspaceLayout, string][] = [['3d', '3D'], ['process', 'Process'], ['electrical', 'Electrical'], ['split', 'Split']];
const bar: React.CSSProperties = { display: 'flex', gap: 4, padding: '4px 8px', background: '#0b1725', fontFamily: 'system-ui, sans-serif', fontSize: 12 };
const tab = (pressed: boolean): React.CSSProperties => ({ padding: '2px 10px', borderRadius: 3, border: '1px solid #3c5366', background: pressed ? '#2a5d8f' : '#132435', color: '#ebf2fa', cursor: 'pointer' });

/** The 3D editor and the 2D process and electrical views over one scene and one selection (ADR-0026). */
export function ScadaWorkspace({ layout, defaultLayout = 'split', onLayoutChange, defaultDiagram = 'process', selectedIds, onSelectionChange, editorRef, style, ...editor }: ScadaWorkspaceProps) {
  const [ownLayout, setOwnLayout] = useState(defaultLayout);
  const shown = layout ?? ownLayout;
  const setLayout = (next: WorkspaceLayout) => {
    if (!layout) setOwnLayout(next);
    onLayoutChange?.(next);
  };
  const [diagram, setDiagram] = useState<Diagram>(defaultDiagram);
  const [ownSelection, setOwnSelection] = useState<string[]>([]);
  const selection = selectedIds ?? ownSelection;
  const select = (ids: string[]) => {
    if (!selectedIds) setOwnSelection(ids);
    onSelectionChange?.(ids);
  };

  // The editor reports every change; the diagrams draw what it holds.
  const [scene, setScene] = useState<ScadaScene>(() => editor.initialScene ?? createEmptyScene());
  const [locked, setLocked] = useState(editor.defaultLocked ?? false);
  const handle = useRef<ScadaHandle | null>(null);
  const setHandle = (h: ScadaHandle | null) => {
    handle.current = h;
    if (typeof editorRef === 'function') editorRef(h);
    else if (editorRef) (editorRef as React.MutableRefObject<ScadaHandle | null>).current = h;
  };
  const isLocked = editor.locked ?? locked;

  const diagramProps = {
    scene,
    registry: editor.registry,
    telemetry: editor.telemetry,
    selectedIds: selection,
    onSelectionChange: select,
    editable: !isLocked,
    onChange: (next: ScadaScene) => void handle.current?.setViews?.(next.views),
    style: { height: '100%' },
  };
  const active: Diagram | undefined = shown === 'process' || shown === 'electrical' ? shown : shown === 'split' ? diagram : undefined;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, ...style }}>
      <div role="toolbar" aria-label="Workspace layout" style={bar}>
        {layouts.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={shown === id} style={tab(shown === id)} onClick={() => setLayout(id)}>{label}</button>
        ))}
        {shown === 'split' && (
          <span role="group" aria-label="Diagram beside 3D" style={{ marginLeft: 12, display: 'flex', gap: 4 }}>
            <button type="button" aria-pressed={diagram === 'process'} style={tab(diagram === 'process')} onClick={() => setDiagram('process')}>Process diagram</button>
            <button type="button" aria-pressed={diagram === 'electrical'} style={tab(diagram === 'electrical')} onClick={() => setDiagram('electrical')}>Electrical diagram</button>
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {/* The editor stays mounted in every layout: it holds the scene's history. */}
        <div style={{ flex: 1, minWidth: 0, display: shown === '3d' || shown === 'split' ? 'block' : 'none' }}>
          <Scada3DEditor
            {...editor}
            ref={setHandle}
            selectedIds={selection}
            onSelectionChange={select}
            onLockedChange={(next) => {
              setLocked(next);
              editor.onLockedChange?.(next);
            }}
            onChange={(next) => {
              setScene(next);
              editor.onChange?.(next);
            }}
          />
        </div>
        {active && (
          <div style={{ flex: 1, minWidth: 0, borderLeft: shown === 'split' ? '1px solid #3c5366' : undefined }}>
            {active === 'process' ? <ProcessView {...diagramProps} /> : <ElectricalView {...diagramProps} />}
          </div>
        )}
      </div>
    </div>
  );
}
