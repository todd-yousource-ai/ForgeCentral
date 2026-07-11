// packages/design/src/components/EntityDrawer.tsx -- the entity-drawer body (IP-CONSOLE-12 DR.2).
//
// The shared drawer content: the six sections (header + Trust Score, information, connected VTZs,
// capabilities, effective policies, recent decisions) plus the quick-action bar, laid out inside the
// `Drawer` host. It is DATA-DRIVEN from the DR.1 view model (`EntityDetailView`): each section is a
// `SectionState`, so the body models every real state without crashing the drawer -- a per-section engine
// error degrades THAT section, a section above the operator's tier or one that does not apply to the
// entity kind is ABSENT (never a disabled placeholder, TRD-CONSOLE-12 Section 6), a not-yet-live binding
// is an honest pending note, and an empty section says "none" rather than fabricating rows. While the
// (rare) no-prefetch load is in flight, sections render skeletons. Presentation only: DR.3/DR.5 supply the
// live view model + wire the action handlers; this ships fixtures-only, no engine coupling.

import type { ReactElement, ReactNode } from 'react';

import type {
  DecisionId,
  EntityDetailView,
  EntityStatus,
  PolicyId,
  SectionState,
  VtzId,
} from '@forge/contracts';

import { Badge, type BadgeVariant } from './Badge.js';
import { Drawer } from './Drawer.js';

/** Quick-action handlers. An omitted handler renders NO button: a PENDING or beyond-tier action is absent. */
export interface EntityQuickActions {
  readonly onIsolate?: () => void;
  readonly onReassignZone?: () => void;
  readonly onViewRemediation?: () => void;
  readonly onOpenReport?: () => void;
}

export interface EntityDrawerProps {
  /** Whether the drawer is open. */
  readonly open: boolean;
  /** Asked to close (Escape, the close button, or a scrim click). */
  readonly onClose: () => void;
  /** The aggregated detail view. Undefined while the no-prefetch load is in flight (renders skeletons). */
  readonly detail?: EntityDetailView | undefined;
  /** Loading (no prefetch hit): render section skeletons instead of content. */
  readonly loading?: boolean;
  /** Quick-action handlers; only provided actions render a button. */
  readonly actions?: EntityQuickActions;
  /** Click-through for a connected VTZ (navigation; wired by the surface). */
  readonly onOpenZone?: (id: VtzId) => void;
  /** Click-through for an effective policy. */
  readonly onOpenPolicy?: (id: PolicyId) => void;
  /** Click-through for a recent decision (its EXPLAIN rationale). */
  readonly onOpenDecision?: (id: DecisionId) => void;
}

/** Render a unix-millis instant as a stable UTC label (the shell is deterministic; a surface may relativize). */
function formatInstant(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

/** The section chrome: a titled block. */
function SectionShell({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="fc-entity-section" aria-label={title}>
      <h3 className="fc-entity-section__title">{title}</h3>
      {children}
    </section>
  );
}

/** A loading skeleton for a section (no fabricated data; a shimmer placeholder). */
function SectionSkeleton({ title }: { title: string }): ReactElement {
  return (
    <SectionShell title={title}>
      <div className="fc-skeleton" aria-hidden="true">
        <span className="fc-skeleton__line" />
        <span className="fc-skeleton__line fc-skeleton__line--short" />
      </div>
    </SectionShell>
  );
}

/**
 * Render one section from its {@link SectionState}. `not-applicable` and `unauthorized` return null (the
 * section is absent, never a disabled placeholder); `pending` and `error` render honest notes; `empty`
 * says "none"; `ok` hands the data to the caller's renderer.
 */
function Section<T>({
  title,
  state,
  loading,
  emptyLabel = 'None.',
  children,
}: {
  title: string;
  state: SectionState<T> | undefined;
  loading?: boolean | undefined;
  emptyLabel?: string | undefined;
  children: (data: T) => ReactNode;
}): ReactElement | null {
  if (loading || !state) return <SectionSkeleton title={title} />;
  switch (state.status) {
    case 'not-applicable':
    case 'unauthorized':
      return null;
    case 'empty':
      return (
        <SectionShell title={title}>
          <p className="fc-entity-section__note">{emptyLabel}</p>
        </SectionShell>
      );
    case 'pending':
      return (
        <SectionShell title={title}>
          <p className="fc-entity-section__note">Not yet available ({state.gatingTask}).</p>
        </SectionShell>
      );
    case 'error':
      return (
        <SectionShell title={title}>
          <p className="fc-entity-section__error" role="alert">
            {state.message}
          </p>
        </SectionShell>
      );
    case 'ok':
      return <SectionShell title={title}>{children(state.data)}</SectionShell>;
  }
}

/** A trust state maps to a semantic badge: "trusted" is good, anything else is neutral until classified. */
/** An entity lifecycle status maps to a semantic badge (active good, suspended caution, compromised critical). */
function statusVariant(status: EntityStatus): BadgeVariant {
  switch (status) {
    case 'active':
      return 'good';
    case 'suspended':
      return 'caution';
    case 'compromised':
      return 'critical';
    case 'unknown':
      return 'neutral';
  }
}

/** A resolved policy effect maps to a semantic badge. */
function policyEffectVariant(effect: 'allow' | 'deny'): BadgeVariant {
  return effect === 'deny' ? 'critical' : 'good';
}

/** A decision status maps to a semantic badge (success/pass good, denied critical, flagged caution). */
function decisionStatusVariant(status: 'success' | 'pass' | 'denied' | 'flagged'): BadgeVariant {
  switch (status) {
    case 'success':
    case 'pass':
      return 'good';
    case 'denied':
      return 'critical';
    case 'flagged':
      return 'caution';
  }
}

export function EntityDrawer({
  open,
  onClose,
  detail,
  loading,
  actions,
  onOpenZone,
  onOpenPolicy,
  onOpenDecision,
}: EntityDrawerProps): ReactElement {
  const headerOk = detail && detail.header.status === 'ok' ? detail.header.data : undefined;
  const title = headerOk ? headerOk.displayName : 'Entity detail';

  return (
    <Drawer open={open} title={title} onClose={onClose}>
      <div className="fc-entity-detail">
        <Section title="Status" state={detail?.header} loading={loading}>
          {(header) => (
            <div className="fc-entity-header">
              <span className="fc-entity-header__kind">{header.kindLabel}</span>
              <Badge variant={statusVariant(header.status)}>{header.status}</Badge>
            </div>
          )}
        </Section>

        <Section title="Information" state={detail?.info} loading={loading}>
          {(info) => (
            <dl className="fc-entity-info">
              <div className="fc-entity-info__row">
                <dt>Role</dt>
                <dd>{info.role ?? 'None'}</dd>
              </div>
              <div className="fc-entity-info__row">
                <dt>Clearance</dt>
                <dd>{info.clearance ?? 'None'}</dd>
              </div>
              <div className="fc-entity-info__row">
                <dt>Enrolled</dt>
                <dd>{formatInstant(info.enrolledAt * 1000)}</dd>
              </div>
              <div className="fc-entity-info__row">
                <dt>Tags</dt>
                <dd className="fc-entity-info__tags">
                  {info.tags.length === 0
                    ? 'None'
                    : info.tags.map((tag) => (
                        <Badge key={tag} variant="neutral">
                          {tag}
                        </Badge>
                      ))}
                </dd>
              </div>
            </dl>
          )}
        </Section>

        <Section title="Connected VTZs" state={detail?.zones} loading={loading}>
          {(zones) =>
            zones.zones.length === 0 ? (
              <p className="fc-entity-section__note">None.</p>
            ) : (
              <ul className="fc-entity-list">
                {zones.zones.map((zone) => (
                  <li key={zone.id}>
                    <button
                      type="button"
                      className="fc-entity-link"
                      onClick={() => onOpenZone?.(zone.id)}
                    >
                      {zone.name}
                    </button>
                  </li>
                ))}
              </ul>
            )
          }
        </Section>

        <Section title="Capabilities" state={detail?.capabilities} loading={loading}>
          {(capabilities) =>
            capabilities.kind === 'none' ? (
              <p className="fc-entity-section__note">Not an agent.</p>
            ) : (
              <ul className="fc-entity-list">
                {capabilities.capabilities.map((capability) => (
                  <li key={`${capability.surface}:${capability.name}`} className="fc-entity-cap">
                    <span className="fc-entity-cap__name">{capability.name}</span>
                    <span className="fc-entity-cap__surface">{capability.surface}</span>
                  </li>
                ))}
              </ul>
            )
          }
        </Section>

        <Section title="Effective policies" state={detail?.effectivePolicies} loading={loading}>
          {(policies) => (
            <ul className="fc-entity-list">
              {policies.policies.map((policy) => (
                <li key={policy.id}>
                  <button
                    type="button"
                    className="fc-entity-link fc-entity-policy"
                    onClick={() => onOpenPolicy?.(policy.id)}
                  >
                    <Badge variant={policyEffectVariant(policy.effect)}>{policy.effect}</Badge>
                    <span className="fc-entity-policy__name">{policy.name}</span>
                    <span className="fc-entity-policy__origin">
                      {policy.origin.kind === 'inherited' ? 'inherited' : 'direct'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent decisions" state={detail?.recentDecisions} loading={loading}>
          {(recent) => (
            <ul className="fc-entity-list">
              {recent.decisions.map((decision) => (
                <li key={decision.decisionId}>
                  <button
                    type="button"
                    className="fc-entity-link fc-entity-decision"
                    onClick={() => onOpenDecision?.(decision.decisionId)}
                  >
                    <Badge variant={decisionStatusVariant(decision.status)}>
                      {decision.outcome}
                    </Badge>
                    <span className="fc-entity-decision__summary">{decision.summary}</span>
                    <time className="fc-entity-decision__time">{formatInstant(decision.at)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="fc-entity-actions" role="group" aria-label="Quick actions">
          {actions?.onIsolate ? (
            <button
              type="button"
              className="fc-entity-action fc-entity-action--critical"
              onClick={actions.onIsolate}
            >
              Isolate from network
            </button>
          ) : null}
          {actions?.onReassignZone ? (
            <button type="button" className="fc-entity-action" onClick={actions.onReassignZone}>
              Modify VTZ assignment
            </button>
          ) : null}
          {actions?.onViewRemediation ? (
            <button type="button" className="fc-entity-action" onClick={actions.onViewRemediation}>
              View remediation
            </button>
          ) : null}
          {actions?.onOpenReport ? (
            <button type="button" className="fc-entity-action" onClick={actions.onOpenReport}>
              Open full report
            </button>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
}
