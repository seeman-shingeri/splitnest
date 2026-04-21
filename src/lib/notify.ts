import { supabase } from "@/integrations/supabase/client";

/**
 * Inserts a notification for every member of a group (owner + members).
 * Failures are swallowed so the calling action still succeeds.
 */
export async function notifyGroup(
  groupId: string,
  type: string,
  title: string,
  body?: string
) {
  try {
    const [{ data: g }, { data: members }] = await Promise.all([
      supabase.from("groups").select("owner_id").eq("id", groupId).maybeSingle(),
      supabase.from("group_members").select("user_id").eq("group_id", groupId),
    ]);
    const ids = new Set<string>();
    if (g?.owner_id) ids.add(g.owner_id);
    (members || []).forEach((m: any) => m.user_id && ids.add(m.user_id));
    if (!ids.size) return;
    const rows = Array.from(ids).map((user_id) => ({
      group_id: groupId,
      user_id,
      type,
      title,
      body: body ?? null,
    }));
    await supabase.from("notifications").insert(rows);
  } catch {
    /* non-blocking */
  }
}
