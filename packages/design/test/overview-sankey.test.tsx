// packages/design/test/overview-sankey.test.tsx -- IP-CONSOLE-01 RD.2 the redesigned Overview Sankey.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OverviewSankeyFlow } from '../src/index.js';
import type { OverviewSankey } from '@forge/contracts';

const band = (level: 'green' | 'yellow' | 'red') => ({
  level,
  escalate: level === 'red' ? 3 : 0,
  candidate: level === 'yellow' ? 2 : 0,
  observe: 5,
});

const graph: OverviewSankey = {
  sources: [
    { class: 'agents', count: 3 },
    { class: 'users', count: 515 },
    { class: 'devices', count: 47 },
  ],
  vtzs: [
    { id: 'vpub', name: 'Demo.Users.Public', profile: 'observe', risk: band('green') },
    { id: 'vpriv', name: 'Demo.Private.Agent', profile: 'observe', risk: band('yellow') },
    { id: 'vpubag', name: 'Demo.Public.Agent', profile: 'observe', risk: band('red') },
  ],
  destinations: [
    {
      class: 'network',
      count: 101,
      apps: [
        { name: 'dns.google', address: '8.8.8.8', count: 6 },
        { name: 'github.com', address: '140.82.112.5', count: 2 },
      ],
      moreCount: 93,
    },
    { class: 'saas', count: 323, apps: [], moreCount: 323 },
    {
      class: 'private-apps',
      count: 52,
      apps: [{ name: 'jira.internal', address: '10.0.0.20', count: 1 }],
      moreCount: 51,
    },
    { class: 'data-stores', count: 18, apps: [], moreCount: 18 },
  ],
  sourceEdges: [
    { sourceClass: 'users', vtzId: 'vpub', weight: 515 },
    { sourceClass: 'devices', vtzId: 'vpub', weight: 47 },
    { sourceClass: 'agents', vtzId: 'vpriv', weight: 1 },
    { sourceClass: 'agents', vtzId: 'vpubag', weight: 2 },
  ],
  destEdges: [
    { vtzId: 'vpub', destClass: 'network', weight: 190 },
    { vtzId: 'vpub', destClass: 'private-apps', weight: 96 },
    { vtzId: 'vpubag', destClass: 'network', weight: 12 },
  ],
  truncated: false,
};

describe('OverviewSankeyFlow', () => {
  it('enumerates sources, VTZs + risk, and destinations in the accessible name (not color alone)', () => {
    render(<OverviewSankeyFlow graph={graph} />);
    const name = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(name).toMatch(/Sources: AI AGENTS 3, USERS 515, DEVICES 47\./);
    expect(name).toMatch(
      /Zones: Demo\.Users\.Public Nominal, Demo\.Private\.Agent Elevated, Demo\.Public\.Agent Critical\./,
    );
    expect(name).toMatch(
      /Destinations: NETWORK 101, SAAS APPS 323, PRIVATE APPS 52, DATA STORES 18\./,
    );
  });

  it('renders source rings, VTZ names + per-VTZ risk class, dest categories, and the app spine', () => {
    const { container } = render(<OverviewSankeyFlow graph={graph} />);
    expect(screen.getByText('515')).toBeInTheDocument();
    expect(screen.getByText('AI AGENTS')).toBeInTheDocument();
    // VTZ name stacks at the first dot; the risk is a per-VTZ token class.
    expect(screen.getByText('Users.Public')).toBeInTheDocument();
    expect(container.querySelector('.fc-ov__vtz--critical')).not.toBeNull();
    expect(container.querySelector('.fc-ov__vtz--good')).not.toBeNull();
    // PR-3b: each zone shows its enforcement profile (all three demo zones are Observe -> "Watching").
    expect(container.querySelectorAll('.fc-ov__vtz-profile')).toHaveLength(3);
    expect(screen.getAllByText('Watching')).toHaveLength(3);
    // Destination category + its common-name apps on the shared arch + the "+N more" tail.
    expect(screen.getByText('NETWORK')).toBeInTheDocument();
    expect(screen.getByText('dns.google')).toBeInTheDocument();
    expect(screen.getByText('+93 more')).toBeInTheDocument();
    // One ribbon per edge (source->VTZ + VTZ->dest), all full opacity when nothing is hovered.
    const ribbons = container.querySelectorAll('.fc-ov__ribbons path');
    expect(ribbons).toHaveLength(graph.sourceEdges.length + graph.destEdges.length);
    expect([...ribbons].every((p) => p.getAttribute('opacity') === '1')).toBe(true);
  });

  it('collapses the named apps to the top five and fans out the rest on click', () => {
    const apps = Array.from({ length: 7 }, (_, i) => ({
      name: `host-${i}.example`,
      address: `10.0.0.${i}`,
      count: 7 - i,
    }));
    const many: OverviewSankey = {
      ...graph,
      destinations: [
        { class: 'network', count: 28, apps, moreCount: 0 },
        ...graph.destinations.filter((d) => d.class !== 'network'),
      ],
    };
    render(<OverviewSankeyFlow graph={many} />);
    // Collapsed: only the top five names show; the 6th/7th hide behind "+2 more".
    expect(screen.getByText('host-0.example')).toBeInTheDocument();
    expect(screen.getByText('host-4.example')).toBeInTheDocument();
    expect(screen.queryByText('host-5.example')).not.toBeInTheDocument();
    // Fan out: clicking the "+2 more" toggle reveals all seven + a "show fewer" affordance.
    fireEvent.click(screen.getByText('+2 more'));
    expect(screen.getByText('host-5.example')).toBeInTheDocument();
    expect(screen.getByText('host-6.example')).toBeInTheDocument();
    expect(screen.getByText('show fewer')).toBeInTheDocument();
  });

  it('shows a single "more" affordance at a time (fan-out toggle collapsed, tail when shown)', () => {
    const apps = Array.from({ length: 7 }, (_, i) => ({
      name: `host-${i}.example`,
      address: `10.0.0.${i}`,
      count: 1,
    }));
    // 7 named apps (2 hidden) AND an unnamed tail of 33: 5 shown + 2 hidden-named + 33 unnamed = 40 = the
    // ring count. Collapsed shows ONE fan-out toggle that accounts for BOTH tails (2 + 33 = 35), never the
    // hidden-named 2 alone (INV-CONSOLE-OVERFLOW-HONEST: shown + overflow == count).
    const withTail: OverviewSankey = {
      ...graph,
      destinations: [
        { class: 'network', count: 40, apps, moreCount: 33 },
        ...graph.destinations.filter((d) => d.class !== 'network'),
      ],
    };
    render(<OverviewSankeyFlow graph={withTail} />);
    expect(screen.getByText('+35 more')).toBeInTheDocument();
    // NOT the under-telling "+2 more" (hidden named only), and no second "+N more" row while collapsed.
    expect(screen.queryByText('+2 more')).not.toBeInTheDocument();
    expect(screen.queryByText('+33 more')).not.toBeInTheDocument();
    // Fan out: the named apps all show + the unnamed remainder reads as its own row, next to "show fewer".
    fireEvent.click(screen.getByText('+35 more'));
    expect(screen.getByText('+33 more')).toBeInTheDocument();
    expect(screen.getByText('show fewer')).toBeInTheDocument();
  });

  it('the ring overflow label accounts for EVERY entity: shown + overflow == count (O1.7 honesty)', () => {
    // A 910-endpoint ring with only 21 named (5 shown, 16 hidden-named) + 889 unnamed: the single
    // collapsed overflow must read "+905 more" (16 + 889), never "+16 more" (the named tail alone).
    const named = Array.from({ length: 21 }, (_, i) => ({
      name: `svc-${i}.example`,
      address: `10.1.0.${i}`,
      count: 1,
    }));
    const big: OverviewSankey = {
      ...graph,
      destinations: [
        { class: 'network', count: 910, apps: named, moreCount: 889 },
        ...graph.destinations.filter((d) => d.class !== 'network'),
      ],
    };
    render(<OverviewSankeyFlow graph={big} />);
    // 5 shown + 905 overflow = 910 = the ring count. The under-telling "+16 more" is never shown.
    expect(screen.getByText('+905 more')).toBeInTheDocument();
    expect(screen.queryByText('+16 more')).not.toBeInTheDocument();
  });

  it('hovering a destination dims the ribbons not on a path that feeds it (linked highlight)', () => {
    const { container } = render(<OverviewSankeyFlow graph={graph} hoveredDest="private-apps" />);
    const ribbons = [...container.querySelectorAll('.fc-ov__ribbons path')];
    // Only Users+Devices -> Public -> private-apps contribute; the rest dim to 0.12.
    const dimmed = ribbons.filter((p) => p.getAttribute('opacity') === '0.12');
    const full = ribbons.filter((p) => p.getAttribute('opacity') === '1');
    expect(dimmed.length).toBeGreaterThan(0);
    expect(full.length).toBe(3); // users>vpub, devices>vpub, vpub>private-apps
  });

  it('reports the hovered destination class to the parent (enter -> class, leave -> null)', () => {
    const onHoverDest = vi.fn();
    const { container } = render(<OverviewSankeyFlow graph={graph} onHoverDest={onHoverDest} />);
    // Destination groups render in graph order; the first is `network`.
    const dest = container.querySelector('.fc-ov__dest');
    expect(dest).not.toBeNull();
    fireEvent.mouseEnter(dest as Element);
    expect(onHoverDest).toHaveBeenLastCalledWith('network');
    fireEvent.mouseLeave(dest as Element);
    expect(onHoverDest).toHaveBeenLastCalledWith(null);
  });

  it('pages the VTZs three per page ("swipe for more")', () => {
    const four: OverviewSankey = {
      ...graph,
      vtzs: [
        ...graph.vtzs,
        { id: 'v4', name: 'Demo.Extra.Zone', profile: 'observe', risk: band('green') },
      ],
    };
    const { rerender } = render(<OverviewSankeyFlow graph={four} vtzPage={0} />);
    expect(screen.getByText('Users.Public')).toBeInTheDocument();
    expect(screen.queryByText('Extra.Zone')).not.toBeInTheDocument();
    rerender(<OverviewSankeyFlow graph={four} vtzPage={1} />);
    expect(screen.getByText('Extra.Zone')).toBeInTheDocument();
    expect(screen.queryByText('Users.Public')).not.toBeInTheDocument();
  });

  it('renders honest empty and loading states', () => {
    const empty: OverviewSankey = {
      sources: [],
      vtzs: [],
      destinations: [],
      sourceEdges: [],
      destEdges: [],
      truncated: false,
    };
    const { rerender } = render(<OverviewSankeyFlow graph={empty} />);
    expect(screen.getByText('No connectivity observed')).toBeInTheDocument();

    rerender(<OverviewSankeyFlow graph={null} loading />);
    const region = screen.getByRole('img');
    expect(region).toHaveAccessibleName('Loading connectivity flow');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });

  it('opens a container via the accessible nav buttons and via a mouse ring click (O1.6b)', () => {
    const onSelectContainer = vi.fn();
    const { container } = render(
      <OverviewSankeyFlow graph={graph} onSelectContainer={onSelectContainer} />,
    );
    // The accessible (keyboard/screen-reader) path: a real button per source lane + dest ring, named
    // with the container label + its connection count -- never mouse-only.
    const agents = screen.getByRole('button', { name: 'Open AI AGENTS members (3 connections)' });
    agents.click();
    expect(onSelectContainer).toHaveBeenCalledWith('agents');
    screen.getByRole('button', { name: 'Open USERS members (515 connections)' }).click();
    expect(onSelectContainer).toHaveBeenCalledWith('users');
    screen.getByRole('button', { name: 'Open DATA STORES members (18 connections)' }).click();
    expect(onSelectContainer).toHaveBeenCalledWith('data-stores');
    // The mouse enhancement: the visible source ring is clickable too.
    const ring = container.querySelector('.fc-ov__ring--agents');
    expect(ring).not.toBeNull();
    fireEvent.click(ring as Element);
    expect(onSelectContainer).toHaveBeenCalledTimes(4);
  });

  it('renders no container nav when onSelectContainer is absent (mouse/keyboard affordance is opt-in)', () => {
    render(<OverviewSankeyFlow graph={graph} />);
    expect(
      screen.queryByRole('button', { name: /Open AI AGENTS members/ }),
    ).not.toBeInTheDocument();
  });

  it('gives every node a hover tooltip (title) with its label + connection count (PR-2c-2)', () => {
    const { container } = render(<OverviewSankeyFlow graph={graph} />);
    const titles = [...container.querySelectorAll('title')].map((t) => t.textContent);
    expect(titles).toContain('AI AGENTS: 3 connections');
    expect(titles).toContain('DEVICES: 47 connections');
    expect(titles).toContain('NETWORK: 101 connections');
    // The VTZ tooltip names the zone + its risk + posture.
    expect(titles).toContain('Demo.Public.Agent: Critical risk, Watching');
  });

  it('hovering a source lane highlights only the paths out of it and dims the rest (PR-2c-2)', () => {
    const onHoverSource = vi.fn();
    const { container, rerender } = render(
      <OverviewSankeyFlow graph={graph} onHoverSource={onHoverSource} />,
    );
    // Enter the agents source ring -> the parent is told to set hoveredSource.
    const agentsRing = container.querySelector('.fc-ov__ring--agents')?.closest('.fc-ov__src');
    expect(agentsRing).not.toBeNull();
    fireEvent.mouseEnter(agentsRing as Element);
    expect(onHoverSource).toHaveBeenCalledWith('agents');

    // Feed it back: agents feeds vpriv + vpubag, which reach only network. Only the source->VTZ->dest
    // edges on those paths stay full; the users/devices ribbons dim.
    rerender(
      <OverviewSankeyFlow graph={graph} onHoverSource={onHoverSource} hoveredSource="agents" />,
    );
    const full = [...container.querySelectorAll('.fc-ov__ribbons path')].filter(
      (p) => p.getAttribute('opacity') === '1',
    );
    // agents>vpriv, agents>vpubag, vpubag>network = 3 full paths (vpriv has no dest edge here).
    expect(full).toHaveLength(3);
  });
});
