import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGroup } from "@/hooks/useGroup";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogOut, Ticket, Scale, ChevronRight, User as UserIcon, Mail, Crown } from "lucide-react";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { data: group } = useGroup();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account and group</p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
            <UserIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {group?.isOwner && <Crown className="h-3.5 w-3.5 text-warning" />}
              <span className="text-xs font-medium text-muted-foreground">{group?.isOwner ? "Group owner" : "Member"}</span>
            </div>
            <div className="truncate text-base font-semibold">{user?.email}</div>
            {group?.name && <div className="truncate text-xs text-muted-foreground">{group.name}</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="divide-y p-0">
          <ProfileLink to="/settlements" icon={Scale} label="Settlements" />
          {group?.isOwner && <ProfileLink to="/referral" icon={Ticket} label="Referral code" />}
          <ProfileLink to="/notifications" icon={Mail} label="Notifications" />
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full" onClick={signOut}>
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}

function ProfileLink({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 p-4 hover:bg-accent/40">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
