import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, ContainerMembersView, Drawer, EntityDrawer } from '@forge/design';
import {
  memberEntityRef,
  type EntityRef,
  type OverviewConnectionList,
  type OverviewMember,
  type SectionState,
} from '@forge/contracts';

import { entityQueryKey, fetchEntityDetail, useEntityDetail } from '../entity/useEntityDetail.js';
import { useIsolate } from '../entity/useIsolate.js';
import { useClassMembers } from '../surfaces/useClassMembers.js';
import { useEntityConnections, type ConnectionSubject } from '../surfaces/useEntityConnections.js';

// The drawer host: the shell-level slide-over that realizes the select-then-act pattern (Section 5.3).
// Clicking any entity anywhere (graph node, table row, decision card) opens a right drawer. Three modes:
// `openEntity(ref)` opens the LIVE entity drawer (IP-CONSOLE-12 DR.3d) -- it fetches the aggregated detail
// from the BFF and renders every section from its SectionState; `openContainer(container, label)` opens the
// LIST of a clicked Sankey container's members (O1.6b), and picking one swaps to its entity detail with a
// BACK affordance to the list; `open(request)` opens a generic titled drawer with caller-supplied content.
// The host owns open/close and mounts exactly one drawer at a time.

export interface DrawerRequest {
  /** The drawer heading (usually the entity name). */
  readonly title: string;
  /** The drawer body. Omitted when a surface has no body; the host shows an honest empty state. */
  readonly content?: ReactNode;
}

/** A clicked Overview container whose members the drawer lists (O1.6b). */
interface ContainerRequest {
  /** The container id passed to the members read (a source lane or a destination ring). */
  readonly container: string;
  /** The human label shown as the drawer title (e.g. "AI Agents", "Data Stores"). */
  readonly label: string;
}

interface DrawerApi {
  /** Open the LIVE entity drawer for an entity ref (fetches its detail from the BFF). */
  readonly openEntity: (ref: EntityRef) => void;
  /** Open the LIST of a clicked container's member entities (O1.6b); picking one opens its detail. */
  readonly openContainer: (container: string, label: string) => void;
  /** Warm the cache for an entity on hover/focus (DR.6), so a subsequent openEntity opens instantly (the
   * detail is served from the cache, no loading flash). Idempotent + cheap: TanStack skips a fresh entity
   * that is already fetching or fresh. */
  readonly prefetchEntity: (ref: EntityRef) => void;
  /** Open a generic titled drawer with caller-supplied content. */
  readonly open: (request: DrawerRequest) => void;
  readonly close: () => void;
  readonly isOpen: boolean;
}

const DrawerContext = createContext<DrawerApi | null>(null);

export function DrawerHost({ children }: { readonly children: ReactNode }): ReactElement {
  const [request, setRequest] = useState<DrawerRequest | null>(null);
  const [container, setContainer] = useState<ContainerRequest | null>(null);
  const [entityRef, setEntityRef] = useState<EntityRef | null>(null);
  // The connectivity subject (LEG id + kind) when the open entity was reached from a connectivity context
  // (a Sankey member), so the drawer can show its outbound connections; null for a non-connectivity open.
  const [connectionSubject, setConnectionSubject] = useState<ConnectionSubject | null>(null);
  const detail = useEntityDetail(entityRef);
  const connections = useEntityConnections(entityRef === null ? null : connectionSubject);
  // The members read for the open container (idle when no container is open). Its own honest states.
  const members = useClassMembers(container === null ? null : container.container);
  const queryClient = useQueryClient();

  // The Isolate quick action (DR.5d): a confirm-gate holding a stable command id (idempotent re-submit),
  // then the brokered command. Enforcement is OFF (AG.7): the confirm and the result say so honestly.
  const isolate = useIsolate(entityRef);
  const [confirm, setConfirm] = useState<{ commandId: string } | null>(null);

  const openEntity = useCallback(
    (ref: EntityRef) => {
      setRequest(null);
      setContainer(null);
      setConnectionSubject(null);
      setEntityRef(ref);
      isolate.reset();
    },
    [isolate],
  );
  const openContainer = useCallback((next: string, label: string) => {
    setRequest(null);
    setEntityRef(null);
    setConnectionSubject(null);
    setContainer({ container: next, label });
  }, []);
  // Open a member's detail from the container list, KEEPING the container so back returns to the list. The
  // member carries its LEG kind + id, the connectivity subject, so the drawer shows its outbound connections.
  const openMember = useCallback(
    (member: OverviewMember) => {
      setConnectionSubject({ id: member.id, kind: member.kind });
      setEntityRef(memberEntityRef(member));
      isolate.reset();
    },
    [isolate],
  );
  // Step back from a member's detail to the container list it was opened from (never closes the drawer).
  const backToList = useCallback(() => {
    setEntityRef(null);
    setConfirm(null);
    isolate.reset();
  }, [isolate]);
  const prefetchEntity = useCallback(
    (ref: EntityRef) => {
      void queryClient.prefetchQuery({
        queryKey: entityQueryKey(ref),
        queryFn: () => fetchEntityDetail(ref),
      });
    },
    [queryClient],
  );
  const open = useCallback((next: DrawerRequest) => {
    setEntityRef(null);
    setContainer(null);
    setConnectionSubject(null);
    setRequest(next);
  }, []);
  const close = useCallback(() => {
    setRequest(null);
    setContainer(null);
    setEntityRef(null);
    setConnectionSubject(null);
    setConfirm(null);
  }, []);

  const api = useMemo<DrawerApi>(
    () => ({
      openEntity,
      openContainer,
      prefetchEntity,
      open,
      close,
      isOpen: request !== null || container !== null || entityRef !== null,
    }),
    [openEntity, openContainer, prefetchEntity, open, close, request, container, entityRef],
  );

  // The member detail was reached from a container list -> its back affordance returns to that list.
  const onBack = container !== null ? backToList : undefined;

  // Project the connections read into a drawer SectionState (undefined = no connectivity subject -> the
  // section does not render; an empty list is the honest "no outbound connections" state).
  const connectionsSection: SectionState<OverviewConnectionList> | undefined =
    connectionSubject === null
      ? undefined
      : connections.isError
        ? { status: 'error', message: 'Could not load connections.' }
        : connections.data === undefined
          ? { status: 'empty' }
          : connections.data.connections.length === 0
            ? { status: 'empty' }
            : { status: 'ok', data: connections.data };

  return (
    <DrawerContext.Provider value={api}>
      {children}
      {entityRef !== null ? (
        detail.isError ? (
          <Drawer open title="Entity" onClose={close} onBack={onBack}>
            <p className="fcx-drawer__empty">Could not load this entity.</p>
          </Drawer>
        ) : (
          <>
            <EntityDrawer
              open
              detail={detail.data}
              loading={detail.isLoading}
              onClose={close}
              onBack={onBack}
              connections={connectionsSection}
              connectionsLoading={connectionSubject !== null && connections.isLoading}
              actions={{ onIsolate: () => setConfirm({ commandId: crypto.randomUUID() }) }}
            />
            <ConfirmDialog
              open={confirm !== null}
              title="Isolate from network?"
              description={`Move ${entityRef.id} into a quarantine posture: contained in a locked-down zone with brokered-only egress. The action is recorded and audited. Live enforcement is OFF (observe/quarantine posture), so no traffic is blocked yet.`}
              confirmLabel="Isolate"
              tone="critical"
              onConfirm={() => {
                if (confirm !== null) {
                  isolate.mutate({ posture: 'quarantine', commandId: confirm.commandId });
                }
                setConfirm(null);
              }}
              onCancel={() => {
                setConfirm(null);
              }}
            />
            {isolate.isSuccess ? (
              <p className="fcx-isolate-result" role="status">
                Isolation recorded ({isolate.data.posture}). Enforcement is off; the disposition is
                audited and distributed to the endpoint.
              </p>
            ) : null}
            {isolate.isError ? (
              <p className="fcx-isolate-result" role="alert">
                Isolation could not be recorded (refused or unavailable).
              </p>
            ) : null}
          </>
        )
      ) : container !== null ? (
        <Drawer open title={container.label} onClose={close}>
          <ContainerMembersView
            members={members.data?.members}
            loading={members.isLoading}
            error={members.isError}
            onSelectMember={openMember}
            onRetry={() => void members.refetch()}
          />
        </Drawer>
      ) : (
        <Drawer open={request !== null} title={request?.title ?? ''} onClose={close}>
          {request?.content ?? (
            <p className="fcx-drawer__empty">
              Entity detail lands with the entity drawer surface. No data is shown here yet.
            </p>
          )}
        </Drawer>
      )}
    </DrawerContext.Provider>
  );
}

/** Open/close the shell drawer from any surface. Throws if used outside a DrawerHost. */
export function useDrawer(): DrawerApi {
  const api = useContext(DrawerContext);
  if (api === null) {
    throw new Error('useDrawer must be used within a DrawerHost');
  }
  return api;
}
