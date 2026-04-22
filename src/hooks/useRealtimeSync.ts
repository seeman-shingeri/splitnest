import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to realtime changes for the current group's data and invalidates
 * relevant React Query caches so the UI updates without a refresh.
 */
export function useRealtimeSync(groupId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!groupId) return;
    const channel = supabase
      .channel(`group-${groupId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `group_id=eq.${groupId}` }, () => {
        qc.invalidateQueries({ queryKey: ["expenses"] });
        qc.invalidateQueries({ queryKey: ["balances"] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        qc.invalidateQueries({ queryKey: ["reports"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_splits" }, () => {
        qc.invalidateQueries({ queryKey: ["balances"] });
        qc.invalidateQueries({ queryKey: ["splits"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_entries", filter: `group_id=eq.${groupId}` }, () => {
        qc.invalidateQueries({ queryKey: ["meal-entries"] });
        qc.invalidateQueries({ queryKey: ["meal-summary"] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, qc]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        qc.invalidateQueries({ queryKey: ["notif-unread"] });
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, qc]);
}
