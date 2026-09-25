// apps/console/src/guide/HelpPanel.tsx -- the contextual side panel (IP-CONSOLE-11-guide GD.11).
//
// Opens the shared Drawer at one guide section: the same generated content the ReadMe renders, with links
// to the full chapter and the section in the ReadMe. A cross reference inside the section opens the ReadMe
// at its target. Loaded lazily with the guide content, like the ReadMe tab.

import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from '@forge/design';

import { EmptyState } from '../states/States.js';
import { GUIDE } from './generated/guide-content.js';
import { GuideNodes, type GuideRenderContext } from './render.js';

export interface HelpPanelProps {
  readonly sectionId: string;
  readonly onClose: () => void;
}

export function HelpPanel({ sectionId, onClose }: HelpPanelProps): ReactElement {
  const navigate = useNavigate();
  const openInReadme = (id: string): void => {
    onClose();
    void navigate({ pathname: '/settings', search: '?tab=readme', hash: id });
  };
  const chapter = GUIDE.chapters.find((c) => c.sections.some((s) => s.id === sectionId));
  const section = chapter?.sections.find((s) => s.id === sectionId);
  const ctx: GuideRenderContext = {
    onNavigate: openInReadme,
    reference: () => <EmptyState title="Open the Settings reference in the ReadMe" />,
  };
  return (
    <Drawer open title={section?.title ?? 'Help'} onClose={onClose}>
      {chapter === undefined || section === undefined ? (
        <EmptyState title="No guide section for this page" />
      ) : (
        <div className="fcx-guide fcx-guide--panel" data-testid="help-panel">
          <p className="fcx-guide__chapnum">
            {chapter.label === 'APPENDIX' ? 'Appendix' : 'Chapter'} {chapter.num}: {chapter.title}
          </p>
          <div className="fcx-guide__chapter">
            <GuideNodes nodes={section.nodes} ctx={ctx} />
          </div>
          <p className="fcx-guide__panel-links">
            <a
              href={`/settings?tab=readme#${chapter.id}`}
              onClick={(event) => {
                event.preventDefault();
                openInReadme(chapter.id);
              }}
            >
              Read the full chapter
            </a>{' '}
            ·{' '}
            <a
              href={`/settings?tab=readme#${section.id}`}
              onClick={(event) => {
                event.preventDefault();
                openInReadme(section.id);
              }}
            >
              Open this section in the ReadMe
            </a>
          </p>
        </div>
      )}
    </Drawer>
  );
}

export default HelpPanel;
