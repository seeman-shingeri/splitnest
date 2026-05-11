import { supabase } from "@/integrations/supabase/client";

/**
 * Sends a whitelisted notification event to every member of a group.
 * Routed through a SECURITY DEFINER RPC so members cannot forge arbitrary
 * notification rows (title/body/type are validated server-side).
 * Failures are swallowed so the calling action still succeeds.
 */
export async function notifyGroup(
  groupId: string,
  type: string,
  title: string,
  body?: string
) {
  try {
    await supabase.rpc("notify_group_event" as any, {
      _group_id: groupId,
      _type: type,
      _title: title,
      _body: body ?? null,
    });
  } catch {
    /* non-blocking */
  }
}
