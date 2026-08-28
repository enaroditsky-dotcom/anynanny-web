/**
 * Edge-safe recovery callback helper.
 * Keep this module free of browser/window and app/session imports so
 * middleware can use it without expanding the Edge bundle.
 */
export function shouldForwardRootAuthCallback(
  pathname: string,
  searchParams: { get(name: string): string | null }
): boolean {
  if (pathname !== "/") return false;
  return (searchParams.get("type") || "").toLowerCase() === "recovery";
}
