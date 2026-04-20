import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface GroupInfo {
  id: string;
  name: string;
  isOwner: boolean;
  ownerId: string;
}

export function useGroup() {
  const { user } = useAuth();

  return useQuery<GroupInfo | null>({
    queryKey: ["group", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      // Prefer owned group; fall back to membership
      const { data: owned } = await supabase
        .from("groups")
        .select("id, name, owner_id")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (owned) {
        return { id: owned.id, name: owned.name, isOwner: true, ownerId: owned.owner_id };
      }
      const { data: mem } = await supabase
        .from("group_members")
        .select("group_id, groups(id, name, owner_id)")
        .eq("user_id", user.id)
        .maybeSingle();
      if (mem?.groups) {
        const g: any = mem.groups;
        return { id: g.id, name: g.name, isOwner: g.owner_id === user.id, ownerId: g.owner_id };
      }
      return null;
    },
  });
}
