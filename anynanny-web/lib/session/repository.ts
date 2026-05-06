import { promises as fs } from "fs";
import path from "path";
import type { SessionRecord } from "@/lib/session/types";

const SESSIONS_FILE = path.join(process.cwd(), "sessions.json");

async function ensureFile(filePath: string, fallback: string) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, fallback, "utf8");
  }
}

async function ensureStorage() {
  await ensureFile(SESSIONS_FILE, "[]");
}

export async function listSessions(): Promise<SessionRecord[]> {
  await ensureStorage();
  const raw = await fs.readFile(SESSIONS_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as SessionRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSessions(entries: SessionRecord[]): Promise<void> {
  await ensureStorage();
  await fs.writeFile(SESSIONS_FILE, JSON.stringify(entries, null, 2), "utf8");
}
