import type { MarketingCharterDocument } from "@/lib/marketing/charters";
import styles from "./marketing-home.module.css";

export function MarketingCharter({ document }: { document: MarketingCharterDocument }) {
  return (
    <details className={styles.charter}>
      <summary>{document.summary}</summary>
      <div className={styles.charterBody}>
        <h3>{document.title}</h3>
        {document.blocks.map((block, index) => {
          if (block.type === "p") {
            return <p key={`${document.title}-p-${index}`}>{block.text}</p>;
          }
          if (block.type === "h3") {
            return <h3 key={`${document.title}-h3-${index}`}>{block.text}</h3>;
          }
          if (block.type === "h4") {
            return <h4 key={`${document.title}-h4-${index}`}>{block.text}</h4>;
          }
          return (
            <ul key={`${document.title}-ul-${index}`}>
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        })}
      </div>
    </details>
  );
}
