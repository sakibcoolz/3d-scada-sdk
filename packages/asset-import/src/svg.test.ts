import { describe, expect, it } from 'vitest';
import { defaultSvgLimits, sanitizeSvg, toSvgMarkup } from './index.js';

const svg = (body: string, attrs = 'viewBox="0 0 100 50"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const ok = (text: string) => {
  const r = sanitizeSvg(text);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};
const codeOf = (text: string) => {
  const r = sanitizeSvg(text);
  return r.ok ? 'OK' : r.errors[0].code;
};

describe('sanitizeSvg: what is kept', () => {
  it('keeps the viewBox and turns every basic shape into a path', () => {
    const r = ok(svg('<rect x="1" y="2" width="10" height="5"/><circle cx="50" cy="25" r="5"/><ellipse cx="70" cy="25" rx="6" ry="3"/><line x1="0" y1="0" x2="10" y2="10"/><polyline points="0,0 5,5 10,0"/><polygon points="0,0 5,5 10,0"/><path d="M0 0 L10 10"/>'));
    expect(r.svg.viewBox).toEqual([0, 0, 100, 50]);
    expect(r.svg.shapes).toHaveLength(7);
    expect(r.svg.shapes[0].d).toBe('M1 2L11 2L11 7L1 7Z');
    expect(r.svg.shapes[5].d).toBe('M0 0L5 5L10 0Z');
    expect(r.svg.shapes[4].d).toBe('M0 0L5 5L10 0');
  });

  it('turns relative and shorthand path commands into absolute ones', () => {
    const r = ok(svg('<path d="m10 10 h5 v5 l-5 0 z m20 0 c1 1 2 2 3 3 s4 4 5 5 q1 1 2 2 t3 3 a5 5 0 0 1 10 0"/>'));
    expect(r.svg.shapes[0].d).toBe('M10 10L15 10L15 15L10 15ZM30 10C31 11 32 12 33 13C34 14 37 17 38 18Q39 19 40 20Q41 21 43 23A5 5 0 0 1 53 23');
  });

  it('composes group transforms and inherits group styles', () => {
    const r = ok(svg('<g transform="translate(10 20)" fill="red" stroke="#00f"><g transform="scale(2)"><path d="M0 0L1 1" stroke-width="3"/></g></g>'));
    expect(r.svg.shapes[0]).toMatchObject({ transform: [2, 0, 0, 2, 10, 20], fill: '#ff0000', stroke: '#0000ff', strokeWidth: 3 });
  });

  it('reads presentation properties from the style attribute', () => {
    const r = ok(svg('<path d="M0 0L1 1" style="fill: #abc; stroke:rgb(255, 0, 0) ; stroke-width:2.5; opacity:0.5; fill-rule: evenodd"/>'));
    expect(r.svg.shapes[0]).toMatchObject({ fill: '#aabbcc', stroke: '#ff0000', strokeWidth: 2.5, opacity: 0.5, fillRule: 'evenodd' });
  });

  it('uses width and height when there is no viewBox', () => {
    expect(ok(svg('<path d="M0 0L1 1"/>', 'width="200mm" height="100mm"')).svg.viewBox).toEqual([0, 0, 200, 100]);
  });

  it('drops text, metadata, editor attributes and unknown elements, and says so', () => {
    const r = ok(svg('<title>Plant</title><metadata>x</metadata><text x="1" y="1">FT-101</text><foo/><path d="M0 0L1 1" inkscape:label="pipe" data-x="1" id="p1"/>'));
    expect(r.svg.shapes).toHaveLength(1);
    expect(r.notes).toEqual(expect.arrayContaining([
      { kind: 'dropped-element', name: 'text', count: 1 },
      { kind: 'dropped-element', name: 'foo', count: 1 },
      { kind: 'dropped-attribute', name: 'inkscape:label', count: 1 },
    ]));
  });

  it('drops an invalid colour and falls back to the inherited one', () => {
    const r = ok(svg('<g fill="#123456"><path d="M0 0L1 1" fill="notacolour"/></g>'));
    expect(r.svg.shapes[0].fill).toBe('#123456');
  });
});

describe('sanitizeSvg: what is rejected', () => {
  it.each([
    ['script', svg('<script>alert(1)</script>'), 'FORBIDDEN_ELEMENT'],
    ['script hidden in defs', svg('<defs><script>alert(1)</script></defs>'), 'FORBIDDEN_ELEMENT'],
    ['foreignObject', svg('<foreignObject><div/></foreignObject>'), 'FORBIDDEN_ELEMENT'],
    ['image', svg('<image href="http://x/a.png"/>'), 'FORBIDDEN_ELEMENT'],
    ['use', svg('<use href="#a"/>'), 'FORBIDDEN_ELEMENT'],
    ['animation that could set href', svg('<set attributeName="href" to="javascript:alert(1)"/>'), 'FORBIDDEN_ELEMENT'],
    ['event handler', svg('<path d="M0 0" onclick="alert(1)"/>'), 'FORBIDDEN_ATTRIBUTE'],
    ['event handler on the root', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="alert(1)"></svg>`, 'FORBIDDEN_ATTRIBUTE'],
    ['href on a shape', svg('<path d="M0 0" href="http://evil"/>'), 'FORBIDDEN_ATTRIBUTE'],
    ['xlink:href', svg('<path d="M0 0" xlink:href="#a"/>'), 'FORBIDDEN_ATTRIBUTE'],
    ['url() in a fill', svg('<path d="M0 0" fill="url(http://evil/x)"/>'), 'FORBIDDEN_VALUE'],
    ['url() in style', svg('<path d="M0 0" style="fill:url(#g)"/>'), 'FORBIDDEN_VALUE'],
    ['javascript: anywhere', svg('<path d="M0 0" stroke="javascript:alert(1)"/>'), 'FORBIDDEN_VALUE'],
    ['DOCTYPE with entities', '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]><svg viewBox="0 0 1 1">&a;</svg>', 'DOCTYPE'],
    ['unknown entity reference', svg('<path d="M0 0" fill="&evil;"/>'), 'MALFORMED_XML'],
    ['processing instruction', svg('<?xml-stylesheet href="x.css"?>'), 'MALFORMED_XML'],
    ['CDATA', svg('<![CDATA[x]]>'), 'MALFORMED_XML'],
    ['unclosed element', '<svg viewBox="0 0 1 1"><g>', 'MALFORMED_XML'],
    ['mismatched end tag', '<svg viewBox="0 0 1 1"><g></path></svg>', 'MALFORMED_XML'],
    ['unquoted attribute', '<svg viewBox=0></svg>', 'MALFORMED_XML'],
    ['not an svg root', '<html><svg viewBox="0 0 1 1"/></html>', 'NOT_SVG'],
    ['malformed path data', svg('<path d="M0 0 L 5"/>'), 'MALFORMED_PATH'],
    ['path letters it does not know', svg('<path d="M0 0 X 5 5"/>'), 'MALFORMED_PATH'],
    ['non-finite numbers', svg('<rect x="1e999" y="0" width="1" height="1"/>'), 'INVALID_NUMBER'],
    ['no size at all', '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>', 'MISSING_SIZE'],
  ])('rejects %s', (_, text, code) => {
    expect(codeOf(text)).toBe(code);
  });

  it('enforces the size, element, depth and path limits', () => {
    expect(codeOf('x'.repeat(defaultSvgLimits.maxBytes + 1))).toBe('TOO_LARGE');
    expect(codeOf(svg('<path d="M0 0L1 1"/>'.repeat(defaultSvgLimits.maxElements + 1)))).toBe('LIMIT_EXCEEDED');
    expect(codeOf(svg('<g>'.repeat(40) + '</g>'.repeat(40)))).toBe('LIMIT_EXCEEDED');
    expect(codeOf(svg(`<path d="M0 0${' L1 1'.repeat(defaultSvgLimits.maxPathCommands + 1)}"/>`))).toBe('LIMIT_EXCEEDED');
    expect(sanitizeSvg(svg('<g><g><path d="M0 0L1 1"/></g></g>'), { maxDepth: 2 }).ok).toBe(false);
  });

  it('never throws, whatever it is given', () => {
    const samples = ['', '<', '<svg', '<svg viewBox="0 0 1 1"><path d="M', '\u0000\u0001', '<svg viewBox="0 0 1 1"><path d="M0 0" fill="#"/></svg>', svg('<path d="M NaN 0"/>')];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const base = svg('<g transform="rotate(30 5 5)" style="fill:red"><path d="M0 0C1 2 3 4 5 6Z"/><circle cx="1" cy="2" r="3"/></g>');
    for (let i = 0; i < 2000; i++) {
      const chars = [...base];
      for (let k = 0; k < 3; k++) chars[Math.floor(rnd() * chars.length)] = String.fromCharCode(32 + Math.floor(rnd() * 95));
      samples.push(chars.join(''));
    }
    for (const s of samples) expect(() => sanitizeSvg(s)).not.toThrow();
  });
});

describe('toSvgMarkup', () => {
  it('writes clean markup that sanitizes back to the same model', () => {
    const r = ok(svg('<g transform="rotate(30 5 5)" fill="red" opacity="0.5"><path d="M0 0C1 2 3 4 5 6Z" fill-rule="evenodd"/><circle cx="1" cy="2" r="3" stroke="blue"/></g><text>x</text>'));
    const again = ok(r.markup);
    expect(again.svg).toEqual(r.svg);
    expect(again.notes).toEqual([]);
    expect(toSvgMarkup(r.svg)).toBe(r.markup);
    expect(r.markup).not.toMatch(/text|script|href|on[a-z]+=/i);
  });
});
