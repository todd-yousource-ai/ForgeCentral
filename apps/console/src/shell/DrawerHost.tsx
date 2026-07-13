import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog, Drawer, EntityDrawer } from '@forge/design';
import type { EntityRef } from '@forge/contracts';

import { entityQueryKey, fetchEntityDetail, useEntityDetail } from '../entity/useEntityDetail.js';
import { useIsolate } from '../entity/useIsolate.js';

// The drawer host: the shell-level slide-over that realizes the select-then-act pattern (Section 5.3).
// Clicking any entity anywhere (graph node, table row, decision card) opens a right drawer. Two modes:
// `openEntity(ref)` opens the LIVE entity drawer (IP-CONSOLE-12 DR.3d) -- it fetches the aggregated detail
// from the BFF and renders every section from its SectionState; `open(request)` opens a generic titled
// drawer with caller-supplied content. The host owns open/close and mounts exactly one drawer at a time.

export interface DrawerRequest {
  /** The drawer heading (usually the entity name). */
  readonly title: string;
  /** The drawer body. Omitted when a surface has no body; the host shows an honest empty state. */
  readonly content?: ReactNode;
}

interface DrawerApi {
  /** Open the LIVE entity drawer for an entity ref (fetches its detail from the BFF). */
  readonly openEntity: (ref: EntityRef) => void;
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
  const [entityRef, setEntityRef] = useState<EntityRef | null>(null);
  const detail = useEntityDetail(entityRef);
  const queryClient = useQueryClient();

  // The Isolate quick action (DR.5d): a confirm-gate holding a stable command id (idempotent re-submit),
  // then the brokered command. Enforcement is OFF (AG.7): the confirm and the result say so honestly.
  const isolate = useIsolate(entityRef);
  const [confirm, setConfirm] = useState<{ commandId: string } | null>(null);

  const openEntity = useCallback(
    (ref: EntityRef) => {
      setRequest(null);
      setEntityRef(ref);
      isolate.reset();
    },
    [isolate],
  );
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
    setRequest(next);
  }, []);
  const close = useCallback(() => {
    setRequest(null);
    setEntityRef(null);
    setConfirm(null);
  }, []);

  const api = useMemo<DrawerApi>(
    () => ({
      openEntity,
      prefetchEntity,
      open,
      close,
      isOpen: request !== null || entityRef !== null,
    }),
    [openEntity, prefetchEntity, open, close, request, entityRef],
  );

  return (
    <DrawerContext.Provider value={api}>
      {children}
      {entityRef !== null ? (
        detail.isError ? (
          <Drawer open title="Entity" onClose={close}>
            <p className="fcx-drawer__empty">Could not load this entity.</p>
          </Drawer>
        ) : (
          <>
            <EntityDrawer
              open
              detail={detail.data}
              loading={detail.isLoading}
              onClose={close}
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
