import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { useGroup } from "@/hooks/useGroup";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPendingReferralCode } from "@/lib/join-flow";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { data: group, isLoading: groupLoading } = useGroup();
  const pendingCode = user ? getPendingReferralCode() : null;

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["member-profile-check", user?.id, group?.id],
    enabled: !!user && !!group?.id && !group.isOwner,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_profiles" as any)
        .select("full_name")
        .eq("user_id", user!.id)
        .eq("group_id", group!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { full_name?: string | null } | null;
    },
  });

  if (loading || groupLoading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (pendingCode && location.pathname !== "/join") return <Navigate to="/join" replace />;
  if (group && !group.isOwner && !profile?.full_name && location.pathname !== "/complete-profile") {
    return <Navigate to="/complete-profile" replace />;
  }
  return <>{children}</>;
}
