import { ANYNANNY_SUPPORT_EMAIL } from "@/lib/legal/contact";

const emailLinkClass =
  "font-semibold text-navy-header underline decoration-navy-header/30 underline-offset-2 break-all";

export function LegalParagraph({ text }: { text: string }) {
  if (!text.includes(ANYNANNY_SUPPORT_EMAIL)) {
    return <p className="whitespace-pre-line">{text}</p>;
  }

  const parts = text.split(ANYNANNY_SUPPORT_EMAIL);

  return (
    <p className="whitespace-pre-line">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {part}
          {index < parts.length - 1 ? (
            <a href={`mailto:${ANYNANNY_SUPPORT_EMAIL}`} className={emailLinkClass}>
              {ANYNANNY_SUPPORT_EMAIL}
            </a>
          ) : null}
        </span>
      ))}
    </p>
  );
}

export function LegalBulletList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 ps-5 text-sm text-slate-700">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
