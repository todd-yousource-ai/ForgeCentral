// apps/console/src/guide/render.tsx -- render the guide's typed tree as React elements (GD.2).
//
// The tree holds only the generator's allowlisted tags and attributes; this renderer maps each one to
// its React prop (class -> className, SVG presentation attributes to camelCase, a style string to an
// object) and turns every in-guide link into a navigation inside the ReadMe. It never sets HTML.

import { createElement, type CSSProperties, type ReactElement, type ReactNode } from 'react';

import type { GuideNode } from './model.js';

/** How the renderer navigates a link and fills a live Settings reference table. */
export interface GuideRenderContext {
  readonly onNavigate: (id: string) => void;
  readonly reference: (keys: readonly string[], id: string) => ReactElement;
}

const RENAMED: Readonly<Record<string, string>> = {
  class: 'className',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
};

function propName(name: string): string {
  const renamed = RENAMED[name];
  if (renamed !== undefined) return renamed;
  // SVG presentation attributes (stroke-width, text-anchor, ...) are camelCase props in React.
  return name.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());
}

function styleObject(style: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const decl of style.split(';')) {
    const at = decl.indexOf(':');
    if (at < 0) continue;
    const name = decl.slice(0, at).trim();
    const value = decl.slice(at + 1).trim();
    if (name !== '' && value !== '') out[propName(name)] = value;
  }
  return out;
}

function renderNode(node: GuideNode, key: number, ctx: GuideRenderContext): ReactNode {
  if (typeof node === 'string') return node;
  const attrs = node.a ?? {};
  if (node.t === 'x-settings-reference') {
    const keys = (attrs['keys'] ?? '').split(' ').filter((k) => k !== '');
    return <div key={key}>{ctx.reference(keys, attrs['id'] ?? '')}</div>;
  }
  const props: Record<string, unknown> = { key };
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'style') props['style'] = styleObject(value);
    else if (name !== 'href') props[propName(name)] = value;
  }
  const href = attrs['href'];
  if (node.t === 'a' && href !== undefined) {
    const target = href.slice(1);
    props['href'] = `#${target}`;
    props['onClick'] = (event: { preventDefault: () => void }) => {
      event.preventDefault();
      ctx.onNavigate(target);
    };
  }
  const children = (node.c ?? []).map((child, i) => renderNode(child, i, ctx));
  // In the console a chapter title is an h2 and a section an h3, so the content's subsections drop a
  // level to keep the outline valid.
  const tag = node.t === 'h3' ? 'h4' : node.t;
  return createElement(tag, props, ...(children.length > 0 ? children : []));
}

export function GuideNodes({
  nodes,
  ctx,
}: {
  readonly nodes: readonly GuideNode[];
  readonly ctx: GuideRenderContext;
}): ReactElement {
  return <>{nodes.map((node, i) => renderNode(node, i, ctx))}</>;
}
