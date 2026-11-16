/** Labels for the password show/hide control. Visibility stays until the user toggles again. */
export const PASSWORD_SHOW_LABEL = "הצג סיסמה";
export const PASSWORD_HIDE_LABEL = "הסתר סיסמה";

export function passwordFieldType(visible: boolean): "password" | "text" {
  return visible ? "text" : "password";
}

export function passwordVisibilityLabel(visible: boolean): string {
  return visible ? PASSWORD_HIDE_LABEL : PASSWORD_SHOW_LABEL;
}

/** Explicit eye-control activation is the only transition that changes visibility. */
export function togglePasswordVisible(visible: boolean): boolean {
  return !visible;
}
