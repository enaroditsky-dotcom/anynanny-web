import { promises as fs } from "fs";
import path from "path";
import type { ChatInitiationLog } from "@/lib/chat/types";

const CHAT_LOGS_FILE = path.join(process.cwd(), "chat_initiations.json");

async function ensureLogsFile() {
  try {
    await fs.access(CHAT_LOGS_FILE);
  } catch {
    await fs.writeFile(CHAT_LOGS_FILE, "[]", "utf8");
  }
}

export async function listChatInitiations(): Promise<ChatInitiationLog[]> {
  await ensureLogsFile();
  const raw = await fs.readFile(CHAT_LOGS_FILE, "utf8");

  try {
    const parsed = JSON.parse(raw) as ChatInitiationLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function appendChatInitiation(entry: ChatInitiationLog): Promise<void> {
  const current = await listChatInitiations();
  current.push(entry);
  await fs.writeFile(CHAT_LOGS_FILE, JSON.stringify(current, null, 2), "utf8");
}
