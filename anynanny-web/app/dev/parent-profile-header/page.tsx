import type { ComponentType } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Parent profile header preview",
  robots: { index: false, follow: false }
};

/**
 * Development-only visual preview.
 * `next build` inlines NODE_ENV as "production" and drops this module from the production graph.
 */
export default function DevParentProfileHeaderPage() {
  if (process.env.NODE_ENV === "development") {
    const { ParentProfileHeaderPreview } = require("./preview") as {
      ParentProfileHeaderPreview: ComponentType;
    };
    return <ParentProfileHeaderPreview />;
  }

  notFound();
}
