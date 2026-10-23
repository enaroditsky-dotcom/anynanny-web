import "server-only";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import type { ValidatedBroadcastQuestion } from "@/lib/admin/broadcast-question-validation";

export const ADMIN_SEND_BROADCAST_QUESTION_RPC = "admin_send_broadcast_question";

export type BroadcastQuestionSendResult = {
  questionId: string;
  recipientCount: number;
  alreadySent: boolean;
  isTest: boolean;
};

function asCount(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export async function sendAdminBroadcastQuestion(input: {
  message: ValidatedBroadcastQuestion;
  isTest: boolean;
  testUserId: string | null;
}): Promise<BroadcastQuestionSendResult> {
  if (!input.message.idempotencyKey) {
    throw new Error("Missing idempotency key.");
  }
  const testUserId = input.testUserId?.trim() || null;
  if (input.isTest && !testUserId) {
    throw new Error("Missing user id.");
  }

  const supabase = getSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc(ADMIN_SEND_BROADCAST_QUESTION_RPC, {
    p_audience: input.message.audience,
    p_prompt: input.message.prompt,
    p_question_format: input.message.questionFormat,
    p_selection_mode: input.message.selectionMode,
    p_options: input.message.options,
    p_idempotency_key: input.message.idempotencyKey,
    p_is_test: input.isTest,
    p_test_user_id: input.isTest ? testUserId : null
  });
  if (error) {
    throw new Error(error.message || "Failed to send question.");
  }

  const row = (data ?? {}) as {
    question_id?: string;
    recipient_count?: number;
    already_sent?: boolean;
    is_test?: boolean;
  };
  const questionId = String(row.question_id ?? "").trim();
  if (!questionId) {
    throw new Error("Question did not return an id.");
  }
  return {
    questionId,
    recipientCount: asCount(row.recipient_count),
    alreadySent: Boolean(row.already_sent),
    isTest: Boolean(row.is_test)
  };
}
