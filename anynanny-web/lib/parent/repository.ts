import { promises as fs } from "fs";
import path from "path";
import type { ParentBusySlot, ParentPreferences } from "@/lib/parent/types";

const PREFERENCES_FILE = path.join(process.cwd(), "parent_preferences.json");
const EVENTS_FILE = path.join(process.cwd(), "parent_calendar_events.json");

async function ensureFile(filePath: string, fallback: string) {
  try {
    await fs.access(filePath);
  } catch {
    try {
      await fs.writeFile(filePath, fallback, "utf8");
    } catch {
      /* read-only FS — reads fall back to empty arrays */
    }
  }
}

async function ensureStorage() {
  await ensureFile(PREFERENCES_FILE, "[]");
  await ensureFile(EVENTS_FILE, "[]");
}

export async function listParentPreferences(): Promise<ParentPreferences[]> {
  await ensureStorage();
  try {
    const raw = await fs.readFile(PREFERENCES_FILE, "utf8");
    const parsed = JSON.parse(raw) as ParentPreferences[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveParentPreferences(entries: ParentPreferences[]): Promise<void> {
  await ensureStorage();
  await fs.writeFile(PREFERENCES_FILE, JSON.stringify(entries, null, 2), "utf8");
}

function sanitizeBusySlot(raw: Record<string, unknown>): ParentBusySlot | null {
  const id = String(raw.id ?? "").trim();
  const parentName = String(raw.parentName ?? "").trim();
  const startsAt = String(raw.startsAt ?? "").trim();
  const endsAt = String(raw.endsAt ?? "").trim();
  if (!id || !parentName || !startsAt || !endsAt) return null;
  return { id, parentName, startsAt, endsAt };
}

export async function listParentBusySlots(): Promise<ParentBusySlot[]> {
  await ensureStorage();
  try {
    const raw = await fs.readFile(EVENTS_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    const slots: ParentBusySlot[] = [];
    for (const row of parsed) {
      if (row && typeof row === "object") {
        const s = sanitizeBusySlot(row as Record<string, unknown>);
        if (s) slots.push(s);
      }
    }
    return slots;
  } catch {
    return [];
  }
}

export async function saveParentBusySlots(entries: ParentBusySlot[]): Promise<void> {
  await ensureStorage();
  await fs.writeFile(EVENTS_FILE, JSON.stringify(entries, null, 2), "utf8");
}
