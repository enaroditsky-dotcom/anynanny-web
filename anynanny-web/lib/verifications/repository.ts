import { promises as fs } from "fs";
import path from "path";
import type { PendingVerification } from "@/lib/verifications/types";

const STORAGE_FILE = path.join(process.cwd(), "pending_verifications.json");

async function ensureStorageFile() {
  try {
    await fs.access(STORAGE_FILE);
  } catch {
    await fs.writeFile(STORAGE_FILE, "[]", "utf8");
  }
}

export async function listPendingVerifications(): Promise<PendingVerification[]> {
  await ensureStorageFile();
  const raw = await fs.readFile(STORAGE_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as PendingVerification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function savePendingVerification(entry: PendingVerification): Promise<void> {
  const current = await listPendingVerifications();
  current.push(entry);
  await fs.writeFile(STORAGE_FILE, JSON.stringify(current, null, 2), "utf8");
}
