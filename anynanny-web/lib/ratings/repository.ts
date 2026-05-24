import { promises as fs } from "fs";
import path from "path";
import type { NannyProfile, NannyRating } from "@/lib/ratings/types";

const RATINGS_FILE = path.join(process.cwd(), "nanny_ratings.json");
const PROFILES_FILE = path.join(process.cwd(), "nanny_profiles.json");

async function ensureFile(filePath: string, fallback: string) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, fallback, "utf8");
  }
}

async function ensureStorage() {
  await ensureFile(RATINGS_FILE, "[]");
  await ensureFile(PROFILES_FILE, "[]");
}

export async function listRatings(): Promise<NannyRating[]> {
  await ensureStorage();
  const raw = await fs.readFile(RATINGS_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as NannyRating[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendRating(entry: NannyRating): Promise<void> {
  const current = await listRatings();
  current.push(entry);
  await fs.writeFile(RATINGS_FILE, JSON.stringify(current, null, 2), "utf8");
}

export async function listProfiles(): Promise<NannyProfile[]> {
  await ensureStorage();
  const raw = await fs.readFile(PROFILES_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as NannyProfile[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveProfiles(entries: NannyProfile[]): Promise<void> {
  await ensureStorage();
  await fs.writeFile(PROFILES_FILE, JSON.stringify(entries, null, 2), "utf8");
}
