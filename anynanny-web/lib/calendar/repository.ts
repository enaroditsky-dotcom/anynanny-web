import { promises as fs } from "fs";
import path from "path";
import type { CalendarBooking, DayAvailability } from "@/lib/calendar/types";

const AVAILABILITY_FILE = path.join(process.cwd(), "sitter_availability.json");
const BOOKINGS_FILE = path.join(process.cwd(), "calendar_bookings.json");

async function ensureFile(filePath: string, fallback: string) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, fallback, "utf8");
  }
}

async function ensureStorage() {
  await ensureFile(AVAILABILITY_FILE, "[]");
  await ensureFile(BOOKINGS_FILE, "[]");
}

export async function listAvailability(): Promise<DayAvailability[]> {
  await ensureStorage();
  const raw = await fs.readFile(AVAILABILITY_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as DayAvailability[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveAvailabilityAll(entries: DayAvailability[]): Promise<void> {
  await ensureStorage();
  await fs.writeFile(AVAILABILITY_FILE, JSON.stringify(entries, null, 2), "utf8");
}

export async function listBookings(): Promise<CalendarBooking[]> {
  await ensureStorage();
  const raw = await fs.readFile(BOOKINGS_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw) as CalendarBooking[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveBookingsAll(entries: CalendarBooking[]): Promise<void> {
  await ensureStorage();
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(entries, null, 2), "utf8");
}
