// apps/console/src/guide/model.ts -- the ReadMe tab's content model (IP-CONSOLE-11-guide GD.2).
//
// The configuration guide is authored once (docs/guide/chapters/) and emitted by
// scripts/generate-guide-content.mjs as this typed tree: an element is a tag, its attributes and its
// children, and only allowlisted tags and attributes can appear (the generator refuses the rest). The
// console renders the tree as React elements; no HTML string reaches the browser.

/** A text run or an element. */
export type GuideNode = string | GuideElement;

export interface GuideElement {
  /** An allowlisted HTML or SVG tag, or `x-settings-reference` (a live Settings reference table). */
  readonly t: string;
  readonly a?: Readonly<Record<string, string>>;
  readonly c?: readonly GuideNode[];
}

export interface GuideSubsection {
  readonly id: string;
  readonly title: string;
}

/** One `h2` section: its heading, its `h3` subsections, its plain text (for the filter) and content. */
export interface GuideSection {
  readonly id: string;
  readonly title: string;
  readonly subsections: readonly GuideSubsection[];
  readonly nodes: readonly GuideNode[];
  readonly text: string;
}

export interface GuideChapter {
  readonly id: string;
  readonly label: 'CHAPTER' | 'APPENDIX';
  readonly num: string;
  readonly title: string;
  /** The settings reference only: every registry key the document's tables list, in order. */
  readonly referenceKeys?: readonly string[];
  readonly intro: readonly GuideNode[];
  readonly sections: readonly GuideSection[];
}

export interface GuideDocument {
  readonly title: string;
  readonly published: string;
  readonly appliesTo: string;
  readonly chapters: readonly GuideChapter[];
}

/** Every addressable id (chapter, section, subsection) and the chapter that holds it. */
export function guideTargets(doc: GuideDocument): ReadonlyMap<string, GuideChapter> {
  const targets = new Map<string, GuideChapter>();
  for (const chapter of doc.chapters) {
    targets.set(chapter.id, chapter);
    for (const section of chapter.sections) {
      targets.set(section.id, chapter);
      for (const sub of section.subsections) targets.set(sub.id, chapter);
    }
  }
  return targets;
}

/** The sections whose title or text contains every word of the query (case-insensitive). */
export function filterSections(
  doc: GuideDocument,
  query: string,
): readonly { readonly chapter: GuideChapter; readonly section: GuideSection }[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w !== '');
  if (words.length === 0) return [];
  const hits: { chapter: GuideChapter; section: GuideSection }[] = [];
  for (const chapter of doc.chapters) {
    for (const section of chapter.sections) {
      const haystack = `${chapter.title} ${section.title} ${section.text}`.toLowerCase();
      if (words.every((w) => haystack.includes(w))) hits.push({ chapter, section });
    }
  }
  return hits;
}
