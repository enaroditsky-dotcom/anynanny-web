export const ADMIN_AUTH_COOKIE = "anynanny_admin_auth";

export function getAdminPassword(): string {
  return (process.env.ADMIN_DASHBOARD_PASSWORD ?? "change-me").trim();
}

export function isValidAdminPassword(password: string): boolean {
  return password.trim() === getAdminPassword();
}
