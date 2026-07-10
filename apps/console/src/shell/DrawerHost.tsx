import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Drawer } from '@forge/design';

// The drawer host: the shell-level slide-over that realizes the select-then-act pattern (Section 5.3).
// Clicking any entity anywhere (graph node, table row, decision card) opens a right drawer whose content
// a surface supplies; the host owns the open/close, the title, and the single mounted Drawer. The content
// itself (identity, score, connected VTZs, capabilities, ...) lands with TRD-CONSOLE-12; F0.8 ships the
// host + an honest empty body so every surface's <=3-click "open the drawer" path is reachable now.

export interface DrawerRequest {
  /** The drawer heading (usually the entity name). */
  readonly title: string;
  /** The drawer body. Omitted in F0.8 (no surface data); surfaces pass real content later. */
  readonly content?: ReactNode;
}

interface DrawerApi {
  readonly open: (request: DrawerRequest) => void;
  readonly close: () => void;
  readonly isOpen: boolean;
}

const DrawerContext = createContext<DrawerApi | null>(null);

export function DrawerHost({ children }: { readonly children: ReactNode }): ReactElement {
  const [request, setRequest] = useState<DrawerRequest | null>(null);

  const open = useCallback((next: DrawerRequest) => {
    setRequest(next);
  }, []);
  const close = useCallback(() => {
    setRequest(null);
  }, []);

  const api = useMemo<DrawerApi>(
    () => ({ open, close, isOpen: request !== null }),
    [open, close, request],
  );

  return (
    <DrawerContext.Provider value={api}>
      {children}
      <Drawer open={request !== null} title={request?.title ?? ''} onClose={close}>
        {request?.content ?? (
          <p className="fcx-drawer__empty">
            Entity detail lands with the entity drawer surface. No data is shown here yet.
          </p>
        )}
      </Drawer>
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
