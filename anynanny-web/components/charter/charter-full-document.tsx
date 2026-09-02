import {
  getCharterDocument,
  getCharterPreamble,
  type CharterSection
} from "@/lib/charter/content";
import type { CharterType } from "@/lib/charter/versions";

function CharterSectionView({ section }: { section: CharterSection }) {
  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-navy-header">{section.heading}</h2>
      {section.paragraphs.map((text) => (
        <p key={text} className="text-sm leading-relaxed text-slate-700">
          {text}
        </p>
      ))}
      {section.bullets?.length ? (
        <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed text-slate-700">
          {section.bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {section.trailingParagraphs?.map((text) => (
        <p key={text} className="text-sm leading-relaxed text-slate-700">
          {text}
        </p>
      ))}
    </section>
  );
}

export function CharterFullDocument({ type }: { type: CharterType }) {
  const doc = getCharterDocument(type);
  const preamble = getCharterPreamble(type);

  return (
    <article className="space-y-6 text-right" lang="he">
      <h1 className="text-xl font-bold text-navy-header">{doc.title}</h1>
      {preamble.map((text) => (
        <p key={text} className="text-sm leading-relaxed text-slate-700">
          {text}
        </p>
      ))}
      {doc.sections.map((section) => (
        <CharterSectionView key={section.heading} section={section} />
      ))}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-navy-header">{doc.closingHeading}</h2>
        {doc.closingParagraphs.map((text) => (
          <p key={text} className="text-sm leading-relaxed text-slate-700">
            {text}
          </p>
        ))}
      </section>
    </article>
  );
}
