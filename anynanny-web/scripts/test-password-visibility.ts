import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PASSWORD_HIDE_LABEL,
  PASSWORD_SHOW_LABEL,
  passwordFieldType,
  passwordVisibilityLabel,
  togglePasswordVisible
} from "../lib/auth/password-visibility";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string): string {
  return readFileSync(resolve(root, relativePath), "utf8");
}

const field = read("components/auth/password-peek-field.tsx");
const login = read("app/auth/login/page.tsx");
const register = read("app/register/page.tsx");
const signUp = read("app/auth/sign-up/page.tsx");
const resetPassword = read("app/auth/reset-password/page.tsx");
const adminLogin = read("app/admin/login/page.tsx");

assert.equal(PASSWORD_SHOW_LABEL, "הצג סיסמה");
assert.equal(PASSWORD_HIDE_LABEL, "הסתר סיסמה");
assert.equal(passwordFieldType(false), "password");
assert.equal(passwordFieldType(true), "text");
assert.equal(passwordVisibilityLabel(false), "הצג סיסמה");
assert.equal(passwordVisibilityLabel(true), "הסתר סיסמה");

let passwordVisible = togglePasswordVisible(false);
let confirmVisible = false;
assert.equal(passwordVisible, true);
assert.equal(confirmVisible, false);
confirmVisible = togglePasswordVisible(confirmVisible);
assert.equal(confirmVisible, true);
assert.equal(passwordVisible, true);
passwordVisible = togglePasswordVisible(passwordVisible);
assert.equal(passwordVisible, false);
assert.equal(confirmVisible, true);

assert.equal((field.match(/useState\(false\)/g) ?? []).length, 1);
assert.equal((field.match(/setVisible\(/g) ?? []).length, 1);
assert.match(field, /setVisible\(\(current\) => togglePasswordVisible\(current\)\)/);
assert.match(field, /type=\{passwordFieldType\(visible\)\}/);
assert.match(field, /aria-label=\{passwordVisibilityLabel\(visible\)\}/);
assert.match(field, /aria-pressed=\{visible\}/);
assert.match(field, /type="button"/);
assert.match(field, /onClick=\{toggleVisibility\}/);
assert.match(field, /onChange=\{\(event\) => onChange\(event\.target\.value\)\}/);
assert.doesNotMatch(field, /onMouseUp|onMouseLeave|onTouchEnd|onBlur|setTimeout|setInterval/);
assert.doesNotMatch(field, /setVisible\(false\)|setPeek\(false\)/);
assert.doesNotMatch(field, /localStorage|sessionStorage|console\.(log|debug|info|warn)/);

assert.match(login, /PasswordPeekField/);
assert.match(login, /autoComplete="current-password"/);
assert.match(login, /name="password"/);
assert.match(login, /signInWithPassword/);
assert.match(login, /navigateAfterAuth/);
assert.doesNotMatch(login, /type="password"/);
assert.doesNotMatch(login, /showPassword|setPeek|passwordVisible/);
assert.match(login, /roleFromQuery === "parent"/);
assert.match(login, /roleFromQuery === "sitter"/);

for (const page of [register, signUp]) {
  assert.match(page, /PasswordPeekField/);
  assert.match(page, /autoComplete="new-password"/);
  assert.match(page, /name="password"/);
  assert.match(page, /supabase\.auth\.signUp/);
  assert.doesNotMatch(page, /type="password"/);
  assert.doesNotMatch(page, /showPassword|setPeek|passwordVisible/);
}
assert.match(register, /value === "parent" \|\| value === "sitter"/);
assert.match(signUp, /setRole\("sitter"\)/);
assert.match(signUp, /setRole\("parent"\)/);

assert.equal((resetPassword.match(/<PasswordPeekField/g) ?? []).length, 2);
assert.match(resetPassword, /validatePasswordConfirmation\(password, confirmPassword\)/);
assert.doesNotMatch(adminLogin, /PasswordPeekField/);
assert.match(adminLogin, /type="password"/);

console.log("password visibility checks passed");
