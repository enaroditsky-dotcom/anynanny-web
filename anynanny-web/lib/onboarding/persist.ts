import type { SupabaseClient } from "@supabase/supabase-js";
import { extractMissingSitterProfileColumn } from "@/lib/sitter/sitter-profile";
import { USER_SPECIAL_OCCASIONS_TABLE } from "@/lib/parent/user-special-occasions";
import type { ParentSpecialEvent } from "@/lib/parent/parent-profile";

function omitUndefined<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined));
}

export async function updateRowStrippingUnknownColumns(
  supabase: SupabaseClient,
  table: string,
  matchColumn: string,
  matchValue: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  let next = omitUndefined(payload);

  for (let attempt = 0; attempt < 24; attempt++) {
    const { error } = await supabase.from(table).update(next).eq(matchColumn, matchValue);
    if (!error) return { error: null };

    const missing = extractMissingSitterProfileColumn(error.message);
    if (missing && Object.prototype.hasOwnProperty.call(next, missing)) {
      const { [missing]: _removed, ...rest } = next;
      next = rest;
      continue;
    }
    return { error: error.message };
  }

  return { error: "שמירת השאלון נכשלה." };
}

export async function replaceUserSpecialOccasions(
  supabase: SupabaseClient,
  userId: string,
  events: ParentSpecialEvent[]
): Promise<void> {
  const rows = events
    .filter((event) => event.title.trim() && event.date)
    .map((event) => ({
      user_id: userId,
      event_name: event.title.trim(),
      event_date: event.date
    }));

  await supabase.from(USER_SPECIAL_OCCASIONS_TABLE).delete().eq("user_id", userId);
  if (rows.length === 0) return;
  await supabase.from(USER_SPECIAL_OCCASIONS_TABLE).insert(rows);
}
