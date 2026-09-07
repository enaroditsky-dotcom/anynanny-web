import type { ProductTourStep } from "@/lib/product-tour/types";

export function tourStepSelectorList(
  step: Pick<ProductTourStep, "targetSelector" | "fallbackSelector">
): string[] {
  return [step.targetSelector, step.fallbackSelector].filter(
    (selector): selector is string => Boolean(selector && selector.trim())
  );
}

export function firstPresentTourSelector(
  selectors: Array<string | null | undefined>,
  hasSelector: (selector: string) => boolean
): string | null {
  for (const selector of selectors) {
    if (selector && hasSelector(selector)) return selector;
  }
  return null;
}
