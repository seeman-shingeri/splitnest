import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGroup } from "@/hooks/useGroup";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LogOut,
  Ticket,
  Scale,
  ChevronRight,
  User as UserIcon,
  Mail,
  Crown,
  Users,
  PlusCircle,
  Check,
} from "lucide-react";

export default function ProfilePage() {
  const { user, signOut } = useAuth();
  const { data: group, groups, setActive } = useGroup();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Your account and groups</p>
      </div>

      <Card className="shadow-[var(--shadow-card)]">
        <CardContent className="flex items-center gap-4 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
            <UserIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {group?.isOwner && <Crown className="h-3.5 w-3.5 text-warning" />}
              <span className="text-xs font-medium text-muted-foreground">
                {group?.isOwner ? "Group owner" : "Member"}
              </span>
            </div>
            <div className="truncate text-base font-semibold">{user?.email}</div>
            {group?.name && <div className="truncate text-xs text-muted-foreground">{group.name}</div>}
          </div>
        </CardContent>
      </Card>

      {groups && groups.length > 1 && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center gap-2 border-b p-4 text-sm font-semibold">
              <Users className="h-4 w-4 text-muted-foreground" />
              Switch group
            </div>
            <div className="divide-y">
              {groups.map((g) => {
                const isActive = g.id === group?.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => !isActive && setActive(g.id)}
                    className="flex w-full items-center gap-3 p-4 text-left hover:bg-accent/40 disabled:opacity-100"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      {g.isOwner ? <Crown className="h-4 w-4 text-warning" /> : <Users className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{g.name}</div>
                      <div className="text-xs text-muted-foreground">{g.isOwner ? "Owner" : "Member"}</div>
                    </div>
                    {isActive ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="divide-y p-0">
          <ProfileLink to="/settlements" icon={Scale} label="Settlements" />
          {group?.isOwner && <ProfileLink to="/referral" icon={Ticket} label="Referral code" />}
          <ProfileLink to="/join" icon={PlusCircle} label="Join another group" />
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
