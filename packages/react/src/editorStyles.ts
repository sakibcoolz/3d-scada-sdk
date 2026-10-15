/** A length for display: metres rounded to the millimetre, without float noise or "-0". */
export function formatMetres(metres: number): string {
  const rounded = Math.round(metres * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/**
 * Editor chrome, scoped to `.scada3d-editor` so host pages are untouched. Colours are custom
 * properties on the root, so a host can retheme by overriding them. Inline styles cannot express
 * hover, focus, disabled or pressed states, hence one small stylesheet.
 */
export const EDITOR_CSS = `
.scada3d-editor {
  --s3-bg: #142437; --s3-raised: #1f3a52; --s3-raised-hover: #28496a; --s3-border: #3c5366;
  --s3-text: #ebf2fa; --s3-muted: #a9bccc; --s3-accent: #63b3ed; --s3-accent-bg: #1e4e79;
  --s3-danger: #ff8a93; --s3-danger-border: #a2464f; --s3-danger-bg: #4a1820; --s3-input: #0f1c2b;
  font-size: 13px;
}
.scada3d-editor aside { background: var(--s3-bg); }
.scada3d-editor h3 { margin: 0 0 8px; font-size: 16px; }
.scada3d-editor h4 { margin: 4px 0 8px; font-size: 14px; font-weight: 600; }
.scada3d-editor small { color: var(--s3-muted); }
.scada3d-editor fieldset { border: none; padding: 0; margin: 0; min-width: 0; }
.scada3d-editor button, .scada3d-editor input[type=file]::file-selector-button {
  font: inherit; color: var(--s3-text); background: var(--s3-raised); border: 1px solid var(--s3-border);
  border-radius: 4px; padding: 4px 10px; cursor: pointer;
}
.scada3d-editor button:hover:not(:disabled), .scada3d-editor input[type=file]:not(:disabled)::file-selector-button:hover {
  background: var(--s3-raised-hover); border-color: var(--s3-accent);
}
.scada3d-editor button[aria-pressed=true] { background: var(--s3-accent-bg); border-color: var(--s3-accent); font-weight: 600; }
.scada3d-editor button:disabled { color: var(--s3-muted); background: transparent; border-style: dashed; cursor: not-allowed; }
.scada3d-editor button.s3-danger { color: var(--s3-danger); background: transparent; border-color: var(--s3-danger-border); }
.scada3d-editor button.s3-danger:hover:not(:disabled) { background: var(--s3-danger-bg); }
.scada3d-editor button.s3-danger:disabled { color: var(--s3-muted); border-color: var(--s3-border); }
.scada3d-editor input:not([type=checkbox]):not([type=range]):not([type=file]), .scada3d-editor select, .scada3d-editor textarea {
  font: inherit; color: var(--s3-text); background: var(--s3-input); border: 1px solid var(--s3-border);
  border-radius: 4px; padding: 3px 6px; box-sizing: border-box;
}
.scada3d-editor textarea { font-family: ui-monospace, monospace; font-size: 12px; width: 100%; }
.scada3d-editor input:disabled, .scada3d-editor select:disabled, .scada3d-editor textarea:disabled { opacity: 0.6; cursor: not-allowed; }
.scada3d-editor :is(button, input, select, textarea, summary):focus-visible { outline: 2px solid var(--s3-accent); outline-offset: 1px; }
.scada3d-editor details.s3-section { border-top: 1px solid var(--s3-border); padding: 6px 0 10px; }
.scada3d-editor details.s3-section > summary {
  cursor: pointer; padding: 4px 0; font-size: 11px; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; color: var(--s3-muted);
}
.scada3d-editor details.s3-section > summary:hover { color: var(--s3-text); }
.scada3d-editor .s3-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 6px; }
.scada3d-editor .s3-field { display: grid; grid-template-columns: 1.4em minmax(0, 1fr); gap: 6px; align-items: center; margin-top: 6px; }
.scada3d-editor .s3-stack { display: block; margin-top: 8px; }
.scada3d-editor .s3-stack > input, .scada3d-editor .s3-stack > select { display: block; width: 100%; margin-top: 3px; }
.scada3d-editor .s3-block { display: block; width: 100%; margin-top: 6px; }
.scada3d-editor .s3-palette { display: grid; gap: 6px; }
.scada3d-editor .s3-palette button { text-align: left; padding: 7px 10px; cursor: grab; }
`;
