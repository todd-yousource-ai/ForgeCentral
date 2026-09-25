// apps/console/src/guide/ReadmeTab.tsx -- the ReadMe tab under Settings (IP-CONSOLE-11-guide GD.2;
// TRD-CONSOLE-11 Section 11, INV-GUIDE-ADDRESSABLE).
//
// The configuration guide inside ForgeCentral: its contents, a filter that narrows the sections, and a
// deep link for every chapter, section and subsection (`/settings?tab=readme#<id>`) that survives a
// reload. The content is the generated tree of the same chapters the printed guide renders; the
// Settings reference is filled from the live SETTINGS_READ. A link to an id that does not exist opens
// the contents with a notice; a filter that matches nothing says so.

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { GlassPanel } from '@forge/design';

import { EmptyState } from '../states/States.js';
import { useGovernedSettings } from '../surfaces/useSettings.js';
import { GUIDE } from './generated/guide-content.js';
import { filterSections, guideTargets, type GuideChapter, type GuideDocument } from './model.js';
import { GuideNodes, type GuideRenderContext } from './render.js';
import { SettingsReferenceTable, UnlistedSettings } from './SettingsReference.js';

function chapterHeading(chapter: GuideChapter): string {
  return `${chapter.label === 'APPENDIX' ? 'Appendix' : 'Chapter'} ${chapter.num}: ${chapter.title}`;
}

function Contents({
  doc,
  onNavigate,
}: {
  readonly doc: GuideDocument;
  readonly onNavigate: (id: string) => void;
}): ReactElement {
  const link = (id: string, text: string): ReactElement => (
    <a
      href={`#${id}`}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(id);
      }}
    >
      {text}
    </a>
  );
  return (
    <nav aria-label="Guide contents" className="fcx-guide__contents" data-testid="guide-contents">
      <ol>
        {doc.chapters.map((chapter) => (
          <li key={chapter.id}>
            {link(chapter.id, chapterHeading(chapter))}
            <ol>
              {chapter.sections.map((section) => (
                <li key={section.id}>{link(section.id, section.title)}</li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ChapterView({
  chapter,
  ctx,
}: {
  readonly chapter: GuideChapter;
  readonly ctx: GuideRenderContext;
}): ReactElement {
  return (
    <article className="fcx-guide__chapter" id={chapter.id} aria-labelledby={`${chapter.id}-title`}>
      <p className="fcx-guide__chapnum">
        {chapter.label} {chapter.num}
      </p>
      <h2 id={`${chapter.id}-title`} className="fcx-guide__title">
        {chapter.title}
      </h2>
      <GuideNodes nodes={chapter.intro} ctx={ctx} />
      {chapter.sections.map((section) => (
        <section key={section.id} aria-labelledby={section.id}>
          <h3 id={section.id}>{section.title}</h3>
          <GuideNodes nodes={section.nodes} ctx={ctx} />
        </section>
      ))}
    </article>
  );
}

/** The live Settings reference read is made only while the reference chapter is on screen. */
function ReferenceChapter({
  chapter,
  onNavigate,
}: {
  readonly chapter: GuideChapter;
  readonly onNavigate: (id: string) => void;
}): ReactElement {
  const read = useGovernedSettings(true);
  const ctx: GuideRenderContext = {
    onNavigate,
    reference: (keys, id) => (
      <SettingsReferenceTable read={read} keys={keys} caption={`Settings reference ${id}`} />
    ),
  };
  return (
    <>
      <ChapterView chapter={chapter} ctx={ctx} />
      <UnlistedSettings read={read} listed={chapter.referenceKeys ?? []} />
    </>
  );
}

function StaticChapter({
  chapter,
  onNavigate,
}: {
  readonly chapter: GuideChapter;
  readonly onNavigate: (id: string) => void;
}): ReactElement {
  const ctx: GuideRenderContext = {
    onNavigate,
    // Only the reference chapter carries live tables; anywhere else one is a generator bug.
    reference: () => <EmptyState title="This table is served by the Settings reference" />,
  };
  return <ChapterView chapter={chapter} ctx={ctx} />;
}

export function ReadmeTab({ doc = GUIDE }: { readonly doc?: GuideDocument }): ReactElement {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const targets = useMemo(() => guideTargets(doc), [doc]);
  const target = decodeURIComponent(location.hash.replace(/^#/, ''));
  const chapter = target === '' ? undefined : targets.get(target);
  const unknown = target !== '' && chapter === undefined;

  const onNavigate = (id: string): void => {
    setQuery('');
    void navigate({ pathname: location.pathname, search: '?tab=readme', hash: id });
  };

  useEffect(() => {
    if (chapter === undefined) return;
    document.getElementById(target)?.scrollIntoView?.({ block: 'start' });
  }, [chapter, target]);

  const hits = useMemo(() => filterSections(doc, query), [doc, query]);
  const filtering = query.trim() !== '';

  return (
    <GlassPanel ariaLabel="ReadMe" header={<span>ReadMe: {doc.title}</span>}>
      <div className="fcx-guide" data-testid="guide">
        <p className="fcx-guide__meta">
          {doc.appliesTo}. Published {doc.published}.{' '}
          {chapter !== undefined || filtering ? (
            <a
              href="#"
              onClick={(event) => {
                event.preventDefault();
                setQuery('');
                void navigate({ pathname: location.pathname, search: '?tab=readme' });
              }}
            >
              Contents
            </a>
          ) : null}
        </p>
        <label className="fcx-guide__filter">
          Filter the guide{' '}
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="for example: dual control"
          />
        </label>
        {filtering ? (
          hits.length === 0 ? (
            <EmptyState
              title="No section matches that filter"
              hint="Try fewer words, or clear the filter to see the contents."
            />
          ) : (
            <ul className="fcx-guide__hits" data-testid="guide-hits">
              {hits.map(({ chapter: c, section }) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigate(section.id);
                    }}
                  >
                    {section.title}
                  </a>{' '}
                  <span className="fcx-guide__where">({chapterHeading(c)})</span>
                </li>
              ))}
            </ul>
          )
        ) : chapter === undefined ? (
          <>
            {unknown ? (
              <p className="fcx-guide__notice" role="status" data-testid="guide-unknown-target">
                The guide has no section named &quot;{target}&quot;. Here are its contents.
              </p>
            ) : null}
            <Contents doc={doc} onNavigate={onNavigate} />
          </>
        ) : chapter.referenceKeys !== undefined ? (
          <ReferenceChapter chapter={chapter} onNavigate={onNavigate} />
        ) : (
          <StaticChapter chapter={chapter} onNavigate={onNavigate} />
        )}
      </div>
    </GlassPanel>
  );
}

export default ReadmeTab;
