import type { ComponentType } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Side drawer preview",
  robots: { index: false, follow: false }
};

/**
 * Development-only shell preview.
 * `next build` inlines NODE_ENV as "production" and drops the development branch,
 * including the preview module, from the production graph.
 */
export default function DevSideDrawerPage() {
  if (process.env.NODE_ENV === "development") {
    const { DrawerPreview } = require("./drawer-preview") as {
      DrawerPreview: ComponentType;
    };
    return <DrawerPreview />;
  }

  notFound();
}
