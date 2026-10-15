// Allow-list SVG sanitizer (ADR-0012). No DOM: a small XML tokenizer, a security scan of the whole
// tree, then conversion of the few kept shapes into a flat model that is written back out cleanly.

export interface SvgLimits {
  /** UTF-8 bytes. */
  maxBytes: number;
  maxElements: number;
  maxDepth: number;
  /** Path commands over the whole file, after shapes are turned into paths. */
  maxPathCommands: number;
}

export const defaultSvgLimits: Readonly<SvgLimits> = { maxBytes: 512 * 1024, maxElements: 5000, maxDepth: 32, maxPathCommands: 20000 };

/** 2D affine transform [a b c d e f], as in SVG `matrix(a b c d e f)`. */
export type SvgMatrix = [number, number, number, number, number, number];

export interface SvgShape {
  /** Absolute path data using only M, L, C, Q, A and Z. */
  d: string;
  transform: SvgMatrix;
  /** `#rrggbb` or `none`. */
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  fillOpacity: number;
  strokeOpacity: number;
  fillRule: 'nonzero' | 'evenodd';
}

export interface SanitizedSvg {
  viewBox: [number, number, number, number];
  shapes: SvgShape[];
}

export type SvgErrorCode =
  | 'TOO_LARGE'
  | 'MALFORMED_XML'
  | 'DOCTYPE'
  | 'NOT_SVG'
  | 'FORBIDDEN_ELEMENT'
  | 'FORBIDDEN_ATTRIBUTE'
  | 'FORBIDDEN_VALUE'
  | 'LIMIT_EXCEEDED'
  | 'MALFORMED_PATH'
  | 'MALFORMED_TRANSFORM'
  | 'INVALID_NUMBER'
  | 'MISSING_SIZE';

export interface SvgError {
  code: SvgErrorCode;
  /** Where in the document, e.g. `svg/g[0]/path[2]`. */
  path: string;
  message: string;
}

/** Things removed on purpose, so the user knows what will not appear. */
export interface SvgNote {
  kind: 'dropped-element' | 'dropped-attribute';
  name: string;
  count: number;
}

export type SanitizeResult = { ok: true; svg: SanitizedSvg; markup: string; notes: SvgNote[] } | { ok: false; errors: SvgError[] };

class SvgFailure extends Error {
  constructor(readonly code: SvgErrorCode, readonly at: string, message: string) {
    super(message);
  }
}
const fail = (code: SvgErrorCode, at: string, message: string): never => {
  throw new SvgFailure(code, at, message);
};

// ---------------------------------------------------------------------------------------------
// XML tokenizer

interface Element {
  name: string;
  attrs: Map<string, string>;
  children: Element[];
  path: string;
}

const NAME = /[A-Za-z_][\w.:-]*/y;
const SPACE = /\s*/y;

function decodeEntities(text: string, at: string): string {
  return text.replace(/&([^;\s&]*);?/g, (match, body: string) => {
    if (!match.endsWith(';')) fail('MALFORMED_XML', at, 'A bare "&" is not allowed; write &amp;.');
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, body)) return named[body];
    const num = /^#(?:x([0-9a-fA-F]{1,6})|([0-9]{1,7}))$/.exec(body);
    if (num) {
      const code = num[1] ? parseInt(num[1], 16) : Number(num[2]);
      if (code > 0 && code <= 0x10ffff) return String.fromCodePoint(code);
    }
    return fail('MALFORMED_XML', at, `Unknown entity &${body}; (only the five XML entities and character references are allowed).`);
  });
}

function parseXml(text: string, limits: SvgLimits): Element {
  let i = 0;
  let count = 0;
  const stack: Element[] = [];
  let root: Element | undefined;
  const at = () => stack[stack.length - 1]?.path ?? 'document';
  const childIndex = new WeakMap<Element, Map<string, number>>();
  if (text.charCodeAt(0) === 0xfeff) i = 1;
  const match = (re: RegExp) => {
    re.lastIndex = i;
    const m = re.exec(text);
    if (m) i = re.lastIndex;
    return m;
  };
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      if (text.slice(i).trim()) fail('MALFORMED_XML', at(), 'Text outside the root element.');
      break;
    }
    if (lt > i && !stack.length && text.slice(i, lt).trim()) fail('MALFORMED_XML', at(), 'Text outside the root element.');
    if (lt > i && stack.length) decodeEntities(text.slice(i, lt), at());
    i = lt;
    if (text.startsWith('<?xml', i) && (text[i + 5] === ' ' || text[i + 5] === '?') && !root && !stack.length) {
      const end = text.indexOf('?>', i);
      if (end < 0) fail('MALFORMED_XML', at(), 'Unterminated XML declaration.');
      i = end + 2;
      continue;
    }
    if (text.startsWith('<?', i)) fail('MALFORMED_XML', at(), 'Processing instructions are not allowed.');
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end < 0) fail('MALFORMED_XML', at(), 'Unterminated comment.');
      i = end + 3;
      continue;
    }
    if (/^<!doctype/i.test(text.slice(i, i + 9)) || text.startsWith('<!ENTITY', i)) fail('DOCTYPE', at(), 'DOCTYPE and entity declarations are not allowed.');
    if (text.startsWith('<!', i)) fail('MALFORMED_XML', at(), 'CDATA sections and markup declarations are not allowed.');
    if (text.startsWith('</', i)) {
      i += 2;
      const name = match(NAME)?.[0];
      match(SPACE);
      if (!name || text[i] !== '>') fail('MALFORMED_XML', at(), 'Malformed end tag.');
      i++;
      const open = stack.pop();
      if (!open || open.name !== name) fail('MALFORMED_XML', open?.path ?? 'document', `End tag </${name}> does not match <${open?.name ?? '(none)'}>.`);
      continue;
    }
    i++;
    const name = match(NAME)?.[0];
    if (!name) fail('MALFORMED_XML', at(), 'Malformed start tag.');
    if (root && !stack.length) fail('MALFORMED_XML', at(), 'Only one root element is allowed.');
    const parent = stack[stack.length - 1];
    let path = name!;
    if (parent) {
      const seen = childIndex.get(parent) ?? new Map<string, number>();
      childIndex.set(parent, seen);
      const n = seen.get(name!) ?? 0;
      seen.set(name!, n + 1);
      path = `${parent.path}/${name}[${n}]`;
    }
    const el: Element = { name: name!, attrs: new Map(), children: [], path };
    for (;;) {
      const space = match(SPACE)![0];
      if (text.startsWith('/>', i) || text[i] === '>') break;
      if (!space) fail('MALFORMED_XML', path, 'Attributes must be separated by white space.');
      const attr = match(NAME)?.[0];
      if (!attr) fail('MALFORMED_XML', path, 'Malformed attribute.');
      match(SPACE);
      if (text[i] !== '=') fail('MALFORMED_XML', path, `Attribute "${attr}" has no value.`);
      i++;
      match(SPACE);
      const quote = text[i];
      if (quote !== '"' && quote !== "'") fail('MALFORMED_XML', path, `Attribute "${attr}" must be quoted.`);
      const end = text.indexOf(quote, i + 1);
      if (end < 0) fail('MALFORMED_XML', path, `Unterminated value of "${attr}".`);
      const raw = text.slice(i + 1, end);
      if (raw.includes('<')) fail('MALFORMED_XML', path, `"<" in the value of "${attr}".`);
      if (el.attrs.has(attr!)) fail('MALFORMED_XML', path, `Duplicate attribute "${attr}".`);
      el.attrs.set(attr!, decodeEntities(raw, path));
      i = end + 1;
    }
    if (++count > limits.maxElements) fail('LIMIT_EXCEEDED', path, `More than ${limits.maxElements} elements.`);
    if (stack.length + 1 > limits.maxDepth) fail('LIMIT_EXCEEDED', path, `Nested deeper than ${limits.maxDepth} levels.`);
    if (parent) parent.children.push(el);
    else root = el;
    if (text.startsWith('/>', i)) i += 2;
    else {
      i++;
      stack.push(el);
    }
  }
  if (stack.length) fail('MALFORMED_XML', stack[stack.length - 1].path, `<${stack[stack.length - 1].name}> is never closed.`);
  if (!root) fail('NOT_SVG', 'document', 'No root element.');
  return root!;
}

// ---------------------------------------------------------------------------------------------
// Security scan and allow-lists

const local = (name: string) => name.slice(name.indexOf(':') + 1).toLowerCase();
const FORBIDDEN_ELEMENTS = new Set(['script', 'foreignobject', 'image', 'use', 'iframe', 'object', 'embed', 'animate', 'animatemotion', 'animatetransform', 'animatecolor', 'set', 'audio', 'video', 'canvas', 'link', 'meta', 'a', 'handler', 'listener']);
const KEPT = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const DANGEROUS_VALUE = /url\s*\(|javascript\s*:|vbscript\s*:|expression\s*\(|data\s*:/i;
const STYLE_PROPS = new Set(['fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule']);
const GEOMETRY: Record<string, string[]> = {
  svg: ['viewBox', 'width', 'height'],
  g: [],
  path: ['d'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polyline: ['points'],
  polygon: ['points'],
};
/** Harmless bookkeeping attributes that are removed without a note. */
const SILENT = (name: string) => name === 'xmlns' || name.startsWith('xmlns:') || name === 'version' || name === 'id' || name === 'xml:space' || name === 'class' || name === 'baseProfile';

function scan(el: Element) {
  if (FORBIDDEN_ELEMENTS.has(local(el.name))) fail('FORBIDDEN_ELEMENT', el.path, `<${el.name}> is not allowed.`);
  for (const [name, value] of el.attrs) {
    const n = local(name);
    if (n.startsWith('on')) fail('FORBIDDEN_ATTRIBUTE', el.path, `Event handler "${name}" is not allowed.`);
    if (n === 'href' || n === 'src') fail('FORBIDDEN_ATTRIBUTE', el.path, `"${name}" (a reference to other content) is not allowed.`);
    if (DANGEROUS_VALUE.test(value)) fail('FORBIDDEN_VALUE', el.path, `The value of "${name}" refers to other content (url(), data: or a script).`);
  }
  el.children.forEach(scan);
}

// ---------------------------------------------------------------------------------------------
// Numbers, colours, transforms

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:px|mm|cm|in|pt|pc)?$/;
function num(value: string | undefined, at: string, what: string, fallback?: number): number {
  if (value === undefined) {
    if (fallback !== undefined) return fallback;
    return fail('INVALID_NUMBER', at, `Missing ${what}.`);
  }
  const v = value.trim();
  if (!NUMBER.test(v)) return fail('INVALID_NUMBER', at, `${what} "${value}" is not a number.`);
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fail('INVALID_NUMBER', at, `${what} "${value}" is not a finite number.`);
  return n;
}
const round = (n: number) => {
  const r = Math.round(n * 1e4) / 1e4;
  return Object.is(r, -0) ? 0 : r;
};
const fmt = (n: number) => String(round(n));

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500', purple: '#800080',
  gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000', navy: '#000080', teal: '#008080', olive: '#808000', lime: '#00ff00',
  aqua: '#00ffff', cyan: '#00ffff', fuchsia: '#ff00ff', magenta: '#ff00ff', brown: '#a52a2a', pink: '#ffc0cb', darkgray: '#a9a9a9', lightgray: '#d3d3d3',
};
function colour(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return 'none';
  if (v === 'currentcolor') return '#000000';
  if (Object.hasOwn(NAMED, v)) return NAMED[v];
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) return hex[1].length === 3 ? `#${[...hex[1]].map((c) => c + c).join('')}` : `#${hex[1]}`;
  const rgb = /^rgb\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*\)$/.exec(v);
  if (rgb) {
    const channel = (c: string) => Math.round(Math.min(255, Math.max(0, c.endsWith('%') ? (parseFloat(c) * 255) / 100 : parseFloat(c))));
    const parts = rgb.slice(1).map(channel);
    if (parts.every(Number.isFinite)) return `#${parts.map((p) => p.toString(16).padStart(2, '0')).join('')}`;
  }
  return undefined;
}

const multiply = (p: SvgMatrix, c: SvgMatrix): SvgMatrix => [
  p[0] * c[0] + p[2] * c[1],
  p[1] * c[0] + p[3] * c[1],
  p[0] * c[2] + p[2] * c[3],
  p[1] * c[2] + p[3] * c[3],
  p[0] * c[4] + p[2] * c[5] + p[4],
  p[1] * c[4] + p[3] * c[5] + p[5],
];
const IDENTITY: SvgMatrix = [1, 0, 0, 1, 0, 0];

function parseTransform(value: string, at: string): SvgMatrix {
  let m: SvgMatrix = IDENTITY;
  const re = /\s*(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)\s*,?/gy;
  let i = 0;
  const v = value.trim();
  while (i < v.length) {
    re.lastIndex = i;
    const part = re.exec(v);
    if (!part) return fail('MALFORMED_TRANSFORM', at, `Cannot read transform "${value}".`);
    i = re.lastIndex;
    const args = part[2].trim() ? part[2].trim().split(/[\s,]+/).map((a) => num(a, at, 'transform value')) : [];
    const need: Record<string, number[]> = { matrix: [6], translate: [1, 2], scale: [1, 2], rotate: [1, 3], skewX: [1], skewY: [1] };
    if (!need[part[1]].includes(args.length)) return fail('MALFORMED_TRANSFORM', at, `${part[1]}() takes ${need[part[1]].join(' or ')} values.`);
    const rad = (deg: number) => (deg * Math.PI) / 180;
    let t: SvgMatrix;
    switch (part[1]) {
      case 'matrix': t = args as SvgMatrix; break;
      case 'translate': t = [1, 0, 0, 1, args[0], args[1] ?? 0]; break;
      case 'scale': t = [args[0], 0, 0, args[1] ?? args[0], 0, 0]; break;
      case 'rotate': {
        const [c, s] = [Math.cos(rad(args[0])), Math.sin(rad(args[0]))];
        const [cx, cy] = [args[1] ?? 0, args[2] ?? 0];
        t = multiply(multiply([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX': t = [1, 0, Math.tan(rad(args[0])), 1, 0, 0]; break;
      default: t = [1, Math.tan(rad(args[0])), 0, 1, 0, 0];
    }
    m = multiply(m, t);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Path data

const PARAMS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

/** Parses path data into absolute M/L/C/Q/A/Z with numbers rounded to 1e-4; counts commands. */
function normalisePath(d: string, at: string, budget: { left: number }): string {
  const out: string[] = [];
  let i = 0;
  let cmd = '';
  let [cx, cy, sx, sy] = [0, 0, 0, 0];
  let lastC: [number, number] | undefined, lastQ: [number, number] | undefined;
  const skip = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
  const NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  const readNumber = (): number => {
    skip();
    NUM.lastIndex = i;
    const m = NUM.exec(d);
    if (!m) return fail('MALFORMED_PATH', at, `Expected a number at position ${i} of the path data.`);
    i = NUM.lastIndex;
    const n = parseFloat(m[0]);
    if (!Number.isFinite(n)) return fail('INVALID_NUMBER', at, 'Path data contains a non-finite number.');
    return n;
  };
  const readFlag = (): number => {
    skip();
    if (d[i] === '0' || d[i] === '1') return d[i++] === '1' ? 1 : 0;
    return fail('MALFORMED_PATH', at, `Expected an arc flag (0 or 1) at position ${i}.`);
  };
  const emit = (s: string) => {
    if (--budget.left < 0) fail('LIMIT_EXCEEDED', at, 'Too many path commands.');
    out.push(s);
  };
  skip();
  if (i < d.length && !/[Mm]/.test(d[i])) fail('MALFORMED_PATH', at, 'Path data must start with M.');
  while (skip(), i < d.length) {
    if (/[A-Za-z]/.test(d[i])) {
      if (!Object.hasOwn(PARAMS, d[i].toLowerCase())) fail('MALFORMED_PATH', at, `Unknown path command "${d[i]}".`);
      cmd = d[i++];
    } else if (!cmd || cmd === 'z' || cmd === 'Z') fail('MALFORMED_PATH', at, `Unexpected "${d[i]}" in path data.`);
    const rel = cmd === cmd.toLowerCase();
    const k = cmd.toLowerCase();
    const ox = rel ? cx : 0, oy = rel ? cy : 0;
    if (k === 'z') {
      emit('Z');
      [cx, cy] = [sx, sy];
      lastC = lastQ = undefined;
      continue;
    }
    if (k === 'a') {
      const [rx, ry, rot] = [readNumber(), readNumber(), readNumber()];
      const [large, sweep] = [readFlag(), readFlag()];
      const [x, y] = [readNumber() + ox, readNumber() + oy];
      emit(`A${fmt(Math.abs(rx))} ${fmt(Math.abs(ry))} ${fmt(rot)} ${large} ${sweep} ${fmt(x)} ${fmt(y)}`);
      [cx, cy] = [x, y];
      lastC = lastQ = undefined;
    } else if (k === 'h' || k === 'v') {
      const n = readNumber();
      if (k === 'h') cx = n + ox; else cy = n + oy;
      emit(`L${fmt(cx)} ${fmt(cy)}`);
      lastC = lastQ = undefined;
    } else {
      const values = Array.from({ length: PARAMS[k] }, (_, j) => readNumber() + (j % 2 === 0 ? ox : oy));
      if (k === 'm') {
        [cx, cy] = values as [number, number];
        [sx, sy] = [cx, cy];
        emit(`M${fmt(cx)} ${fmt(cy)}`);
        cmd = rel ? 'l' : 'L'; // further pairs are line-tos
        lastC = lastQ = undefined;
      } else if (k === 'l' || k === 't') {
        const [x, y] = values;
        if (k === 't') {
          const q: [number, number] = lastQ ? [2 * cx - lastQ[0], 2 * cy - lastQ[1]] : [cx, cy];
          emit(`Q${fmt(q[0])} ${fmt(q[1])} ${fmt(x)} ${fmt(y)}`);
          lastQ = q;
          lastC = undefined;
        } else {
          emit(`L${fmt(x)} ${fmt(y)}`);
          lastC = lastQ = undefined;
        }
        [cx, cy] = [x, y];
      } else if (k === 'c' || k === 's') {
        const [x1, y1, x2, y2, x, y] = k === 'c' ? values : [...(lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy]), ...values];
        emit(`C${[x1, y1, x2, y2, x, y].map(fmt).join(' ')}`);
        lastC = [x2, y2];
        lastQ = undefined;
        [cx, cy] = [x, y];
      } else {
        const [x1, y1, x, y] = values;
        emit(`Q${[x1, y1, x, y].map(fmt).join(' ')}`);
        lastQ = [x1, y1];
        lastC = undefined;
        [cx, cy] = [x, y];
      }
    }
  }
  return out.join('');
}

function points(value: string, at: string): number[] {
  const parts = value.trim() ? value.trim().split(/[\s,]+/) : [];
  if (parts.length % 2) fail('MALFORMED_PATH', at, 'Points must come in x,y pairs.');
  return parts.map((p) => num(p, at, 'point'));
}

/** The element's geometry as path data in its own coordinates. */
function shapePath(el: Element, kind: string, at: string, budget: { left: number }): string {
  const a = (name: string, fallback?: number) => num(el.attrs.get(name), at, name, fallback);
  switch (kind) {
    case 'path':
      return normalisePath(el.attrs.get('d') ?? '', at, budget);
    case 'rect': {
      const [x, y, w, h] = [a('x', 0), a('y', 0), a('width'), a('height')];
      let rx = Math.min(Math.abs(a('rx', el.attrs.has('ry') ? a('ry') : 0)), w / 2);
      let ry = Math.min(Math.abs(a('ry', el.attrs.has('rx') ? a('rx') : 0)), h / 2);
      if (!(rx > 0 && ry > 0)) rx = ry = 0;
      const d = rx
        ? `M${x + rx} ${y}L${x + w - rx} ${y}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}L${x + w} ${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}L${x + rx} ${y + h}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}L${x} ${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
        : `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;
      return normalisePath(d, at, budget);
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [a('cx', 0), a('cy', 0)];
      const [rx, ry] = kind === 'circle' ? [a('r'), a('r')] : [a('rx'), a('ry')];
      return normalisePath(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`, at, budget);
    }
    case 'line':
      return normalisePath(`M${a('x1', 0)} ${a('y1', 0)}L${a('x2', 0)} ${a('y2', 0)}`, at, budget);
    default: {
      const p = points(el.attrs.get('points') ?? '', at);
      if (p.length < 4) fail('MALFORMED_PATH', at, 'A polyline or polygon needs at least two points.');
      const d = p.reduce((s, n, j) => s + (j % 2 === 0 ? `${j === 0 ? 'M' : 'L'}${n}` : ` ${n}`), '') + (kind === 'polygon' ? 'Z' : '');
      return normalisePath(d, at, budget);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Conversion

interface Style { fill: string; stroke: string; strokeWidth: number; opacity: number; fillOpacity: number; strokeOpacity: number; fillRule: 'nonzero' | 'evenodd' }
const DEFAULT_STYLE: Style = { fill: '#000000', stroke: 'none', strokeWidth: 1, opacity: 1, fillOpacity: 1, strokeOpacity: 1, fillRule: 'nonzero' };

function sanitize(text: string, limits: SvgLimits): { svg: SanitizedSvg; notes: SvgNote[] } {
  if (new TextEncoder().encode(text).length > limits.maxBytes) fail('TOO_LARGE', 'document', `Larger than ${limits.maxBytes} bytes.`);
  const root = parseXml(text, limits);
  if (local(root.name) !== 'svg') fail('NOT_SVG', root.path, `The root element is <${root.name}>, not <svg>.`);
  scan(root);
  const counts = new Map<string, number>();
  const note = (kind: SvgNote['kind'], name: string) => counts.set(`${kind}\u0000${name}`, (counts.get(`${kind}\u0000${name}`) ?? 0) + 1);
  const budget = { left: limits.maxPathCommands };
  const shapes: SvgShape[] = [];

  const styleOf = (el: Element, parent: Style): Style => {
    const props = new Map<string, string>();
    for (const [name, value] of el.attrs) if (STYLE_PROPS.has(name)) props.set(name, value);
    const inline = el.attrs.get('style');
    if (inline !== undefined) {
      for (const decl of inline.split(';')) {
        if (!decl.trim()) continue;
        const colon = decl.indexOf(':');
        const prop = (colon < 0 ? decl : decl.slice(0, colon)).trim().toLowerCase();
        if (colon < 0 || !STYLE_PROPS.has(prop)) { note('dropped-attribute', `style:${prop}`); continue; }
        props.set(prop, decl.slice(colon + 1).trim());
      }
    }
    const s: Style = { ...parent, opacity: parent.opacity };
    for (const [prop, value] of props) {
      if (prop === 'fill' || prop === 'stroke') {
        const c = colour(value);
        if (c) s[prop] = c; else note('dropped-attribute', prop);
      } else if (prop === 'fill-rule') {
        if (value === 'evenodd' || value === 'nonzero') s.fillRule = value; else note('dropped-attribute', prop);
      } else {
        const v = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:px)?$/.test(value.trim()) ? parseFloat(value) : NaN;
        if (!Number.isFinite(v) || v < 0) { note('dropped-attribute', prop); continue; }
        if (prop === 'stroke-width') s.strokeWidth = v;
        else if (prop === 'opacity') s.opacity = parent.opacity * Math.min(1, v);
        else if (prop === 'fill-opacity') s.fillOpacity = Math.min(1, v);
        else s.strokeOpacity = Math.min(1, v);
      }
    }
    return s;
  };

  const visit = (el: Element, parentMatrix: SvgMatrix, parentStyle: Style, isRoot: boolean) => {
    const kind = local(el.name);
    if (!KEPT.has(kind)) { note('dropped-element', kind); return; }
    for (const name of el.attrs.keys()) {
      if (GEOMETRY[kind].includes(name) || STYLE_PROPS.has(name) || name === 'style' || name === 'transform' || SILENT(name)) continue;
      note('dropped-attribute', name);
    }
    const matrix = el.attrs.has('transform') && !isRoot ? multiply(parentMatrix, parseTransform(el.attrs.get('transform')!, el.path)) : parentMatrix;
    const style = styleOf(el, parentStyle);
    if (kind === 'svg' || kind === 'g') {
      el.children.forEach((c) => visit(c, matrix, style, false));
      return;
    }
    shapes.push({
      d: shapePath(el, kind, el.path, budget),
      transform: matrix.map(round) as SvgMatrix,
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth: round(style.strokeWidth),
      opacity: round(style.opacity),
      fillOpacity: round(style.fillOpacity),
      strokeOpacity: round(style.strokeOpacity),
      fillRule: style.fillRule,
    });
  };

  let viewBox: [number, number, number, number];
  const vb = root.attrs.get('viewBox');
  if (vb !== undefined) {
    const parts = vb.trim().split(/[\s,]+/).map((p) => num(p, root.path, 'viewBox value'));
    if (parts.length !== 4 || !(parts[2] > 0 && parts[3] > 0)) fail('INVALID_NUMBER', root.path, 'viewBox must be four numbers with a positive width and height.');
    viewBox = parts.map(round) as [number, number, number, number];
  } else if (root.attrs.has('width') && root.attrs.has('height')) {
    const [w, h] = [num(root.attrs.get('width'), root.path, 'width'), num(root.attrs.get('height'), root.path, 'height')];
    if (!(w > 0 && h > 0)) fail('INVALID_NUMBER', root.path, 'width and height must be positive.');
    viewBox = [0, 0, round(w), round(h)];
  } else {
    viewBox = fail('MISSING_SIZE', root.path, 'The drawing has neither a viewBox nor a width and height.');
  }
  visit(root, IDENTITY, DEFAULT_STYLE, true);
  const notes = [...counts].map(([k, count]) => {
    const [kind, name] = k.split('\u0000') as [SvgNote['kind'], string];
    return { kind, name, count };
  });
  return { svg: { viewBox, shapes }, notes };
}

/** Sanitizes SVG text into a flat shape model plus clean markup, or explains why it was refused. */
export function sanitizeSvg(text: string, limits: Partial<SvgLimits> = {}): SanitizeResult {
  try {
    if (typeof text !== 'string') return { ok: false, errors: [{ code: 'NOT_SVG', path: 'document', message: 'Expected SVG text.' }] };
    const { svg, notes } = sanitize(text, { ...defaultSvgLimits, ...limits });
    return { ok: true, svg, markup: toSvgMarkup(svg), notes };
  } catch (e) {
    if (e instanceof SvgFailure) return { ok: false, errors: [{ code: e.code, path: e.at, message: e.message }] };
    return { ok: false, errors: [{ code: 'MALFORMED_XML', path: 'document', message: 'The file could not be read as SVG.' }] };
  }
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Clean markup written from the model only: one <path> per shape, defaults left out. */
export function toSvgMarkup(svg: SanitizedSvg): string {
  const body = svg.shapes.map((s) => {
    const attrs: string[] = [`d="${escape(s.d)}"`];
    if (s.transform.some((v, i) => v !== IDENTITY[i])) attrs.push(`transform="matrix(${s.transform.map(fmt).join(' ')})"`);
    if (s.fill !== DEFAULT_STYLE.fill) attrs.push(`fill="${s.fill}"`);
    if (s.stroke !== DEFAULT_STYLE.stroke) attrs.push(`stroke="${s.stroke}"`);
    if (s.strokeWidth !== DEFAULT_STYLE.strokeWidth) attrs.push(`stroke-width="${fmt(s.strokeWidth)}"`);
    if (s.opacity !== 1) attrs.push(`opacity="${fmt(s.opacity)}"`);
    if (s.fillOpacity !== 1) attrs.push(`fill-opacity="${fmt(s.fillOpacity)}"`);
    if (s.strokeOpacity !== 1) attrs.push(`stroke-opacity="${fmt(s.strokeOpacity)}"`);
    if (s.fillRule !== 'nonzero') attrs.push(`fill-rule="${s.fillRule}"`);
    return `<path ${attrs.join(' ')}/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svg.viewBox.map(fmt).join(' ')}">${body.join('')}</svg>`;
}
