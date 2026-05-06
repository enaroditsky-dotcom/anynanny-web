import { ChatLogsTable } from "@/components/admin/chat-logs-table";
import { listChatInitiations } from "@/lib/chat/repository";

export default async function AdminChatLogsPage() {
  const logs = await listChatInitiations();
  const sortedLogs = [...logs].sort((a, b) => new Date(b.initiatedAt).getTime() - new Date(a.initiatedAt).getTime());

  return (
    <main className="mx-auto max-w-5xl p-6 md:py-16">
      <h1 className="mb-2 text-2xl font-semibold text-navy-900">Chat Initiation Logs</h1>
      <p className="mb-6 text-sm text-navy-700">Ops view for outbound parent-sitter messaging before sessions start.</p>

      <ChatLogsTable logs={sortedLogs} />
    </main>
  );
}
