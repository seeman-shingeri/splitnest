import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

export interface GroupInfo {
  id: string;
  name: string;
  isOwner: boolean;
  ownerId: string;
  role: "owner" | "member";
}

const ACTIVE_GROUP_KEY = "splitnest:activeGroupId";

export function getActiveGroupId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_GROUP_KEY);
  } catch {
    return null;
  }
}

export function setActiveGroupId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_GROUP_KEY, id);
    else localStorage.removeItem(ACTIVE_GROUP_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Returns every group the user belongs to (owned + joined).
 */
export function useGroups() {
  const { user } = useAuth();

  return useQuery<GroupInfo[]>({
    queryKey: ["groups", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const seen = new Map<string, GroupInfo>();

      const { data: owned } = await supabase
        .from("groups")
        .select("id, name, owner_id")
        .eq("owner_id", user.id);
      (owned ?? []).forEach((g) => {
        seen.set(g.id, {
          id: g.id,
          name: g.name,
          isOwner: true,
          ownerId: g.owner_id,
          role: "owner",
        });
      });

      const { data: memberships } = await supabase
        .from("group_members")
        .select("role, groups(id, name, owner_id)")
        .eq("user_id", user.id);
      (memberships ?? []).forEach((m: any) => {
        const g = m.groups;
        if (!g || seen.has(g.id)) return;
        seen.set(g.id, {
          id: g.id,
          name: g.name,
          isOwner: g.owner_id === user.id,
          ownerId: g.owner_id,
          role: g.owner_id === user.id ? "owner" : (m.role === "owner" ? "owner" : "member"),
        });
      });

      return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

/**
 * Returns the currently *active* group for the signed-in user.
 * Backwards-compatible with the previous single-group hook signature.
 */
export function useGroup() {
  const { user } = useAuth();
  const groupsQuery = useGroups();
  const qc = useQueryClient();

  const groups = groupsQuery.data ?? [];
  const stored = getActiveGroupId();
  const active =
    groups.find((g) => g.id === stored) ??
    groups.find((g) => g.isOwner) ??
    groups[0] ??
    null;

  // Keep storage in sync with what we actually resolved.
  useEffect(() => {
    if (active && stored !== active.id) {
      setActiveGroupId(active.id);
    }
    if (!active && stored) {
      setActiveGroupId(null);
    }
  }, [active?.id, stored]);

  return {
    ...groupsQuery,
    data: active,
    groups,
    setActive: (id: string) => {
      setActiveGroupId(id);
      qc.invalidateQueries({ queryKey: ["groups", user?.id] });
      // Bust everything that depends on the active group.
      qc.invalidateQueries();
    },
  };
}
