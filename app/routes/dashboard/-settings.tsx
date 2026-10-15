import { useConvex, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, UserPlus } from "lucide-react";
import { MemberInvite } from "@/components/teams/MemberInvite";
import { dashboardHomePath, teamHomePath } from "@/lib/routes";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { useSettingsData } from "./-settings.data";
import { prewarmTeam } from "./-team.data";
import { DashboardHeader } from "@/components/DashboardHeader";
import { useRegisterPaletteCommands, type PaletteCommand } from "@/lib/commandPalette";

const GIBIBYTE = 1024 ** 3;
const TEBIBYTE = 1024 ** 4;

function formatBytes(bytes: number): string {
  if (bytes >= TEBIBYTE) return `${(bytes / TEBIBYTE).toFixed(1)} TB`;
  return `${(bytes / GIBIBYTE).toFixed(1)} GB`;
}

export default function TeamSettingsPage() {
  const params = useParams({ strict: false });
  const navigate = useNavigate({});
  const { pathname, hash } = useLocation();
  const convex = useConvex();
  const teamSlug = typeof params.teamSlug === "string" ? params.teamSlug : "";

  const { context, team, members, billing } = useSettingsData({ teamSlug });
  const updateTeam = useMutation(api.teams.update);
  const deleteTeam = useMutation(api.teams.deleteTeam);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);
  const prewarmTeamIntentHandlers = useRoutePrewarmIntent(() => {
    if (!team?.slug) return;
    return prewarmTeam(convex, { teamSlug: team.slug });
  });

  const canonicalSettingsPath = context ? `${context.canonicalPath}/settings` : null;
  const isSettingsPath = pathname.endsWith("/settings");
  const shouldCanonicalize =
    isSettingsPath && !!canonicalSettingsPath && pathname !== canonicalSettingsPath;

  useEffect(() => {
    if (shouldCanonicalize && canonicalSettingsPath) {
      navigate({ to: canonicalSettingsPath, replace: true });
    }
  }, [shouldCanonicalize, canonicalSettingsPath, navigate]);

  const paletteCanInvite = team?.role === "owner" || team?.role === "admin";
  const paletteCommands = useMemo<PaletteCommand[]>(
    () =>
      paletteCanInvite
        ? [
            {
              id: "invite-member",
              label: "Invite member",
              keywords: ["people", "add", "team"],
              icon: UserPlus,
              run: () => setMemberDialogOpen(true),
            },
          ]
        : [],
    [paletteCanInvite],
  );
  useRegisterPaletteCommands(paletteCommands);

  // Palette links land on #billing or #members; the sections render after data loads.
  useEffect(() => {
    if (hash && team) document.getElementById(hash)?.scrollIntoView({ block: "start" });
  }, [hash, team]);

  if (context === undefined || shouldCanonicalize) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-[#888]">Loading...</div>
      </div>
    );
  }

  if (context === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-[#888]">Team not found</div>
      </div>
    );
  }

  const isOwner = team.role === "owner";
  const isAdmin = team.role === "owner" || team.role === "admin";
  const canDeleteTeam = isOwner;

  const storageUsed = billing?.storageUsedBytes ?? 0;
  const storageLimit = billing?.storageLimitBytes ?? 0;
  const storagePct = storageLimit > 0 ? Math.min((storageUsed / storageLimit) * 100, 100) : 0;
  const storageBarColor =
    storagePct >= 100 ? "bg-[#dc2626]" : storagePct >= 90 ? "bg-[#ca8a04]" : "bg-[#2d5a2d]";

  const handleSaveName = async () => {
    if (!editedName.trim()) return;
    try {
      await updateTeam({ teamId: team._id, name: editedName.trim() });
      setIsEditingName(false);
    } catch (error) {
      console.error("Failed to update team name:", error);
    }
  };

  const handleDeleteTeam = async () => {
    if (
      !confirm(
        "Are you sure you want to delete this team? This action cannot be undone and will delete all projects and videos.",
      )
    ) {
      return;
    }

    if (!confirm("Type the team name to confirm: " + team.name)) return;

    try {
      await deleteTeam({ teamId: team._id });
      navigate({ to: dashboardHomePath() });
    } catch (error) {
      console.error("Failed to delete team:", error);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <DashboardHeader
        paths={[
          {
            label: team.slug,
            href: teamHomePath(team.slug),
            prewarmIntentHandlers: prewarmTeamIntentHandlers,
          },
          { label: "settings" },
        ]}
      />

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
          {/* ── Hero: Team name + URL ── */}
          <div className="mb-8">
            {isEditingName ? (
              <div className="flex items-center gap-3">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="h-auto border-t-0 border-r-0 border-b-2 border-l-0 border-[#1a1a1a] bg-transparent px-2 py-1 text-4xl font-black tracking-tight focus-visible:ring-0 focus-visible:ring-offset-0"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSaveName();
                    if (e.key === "Escape") setIsEditingName(false);
                  }}
                />
                <Button size="sm" onClick={() => void handleSaveName()}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsEditingName(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="group flex items-baseline gap-3">
                <h1 className="text-4xl font-black tracking-tight text-[#1a1a1a] lg:text-5xl">
                  {team.name}
                </h1>
                {isAdmin && (
                  <button
                    onClick={() => {
                      setEditedName(team.name);
                      setIsEditingName(true);
                    }}
                    className="text-[#888] opacity-0 transition-colors group-hover:opacity-100 hover:text-[#1a1a1a]"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <p className="mt-1 font-mono text-sm text-[#888]">
              {typeof window !== "undefined"
                ? `${window.location.origin}${teamHomePath(team.slug)}`
                : teamHomePath(team.slug)}
            </p>
          </div>

          {/* ── Stats strip ── */}
          <div className="mb-8 grid grid-cols-1 gap-4 border-t-2 border-b-2 border-[#1a1a1a] py-5 sm:grid-cols-3 sm:gap-6 lg:gap-12">
            <div>
              <p className="mb-1 text-[10px] tracking-[0.2em] text-[#888] uppercase">Plan</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-[#1a1a1a]">Self-hosted</span>
                <Badge variant="success">Local</Badge>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] tracking-[0.2em] text-[#888] uppercase">Storage</p>
              <p className="text-xl font-black text-[#1a1a1a]">
                {billing ? formatBytes(storageUsed) : "—"}
                <span className="text-sm font-bold text-[#888]">
                  {" "}
                  / {formatBytes(storageLimit)}
                </span>
              </p>
              <div className="mt-2 h-1.5 bg-[#ddd]">
                <div
                  className={`h-full transition-all duration-500 ${storageBarColor}`}
                  style={{ width: `${storagePct}%` }}
                />
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10px] tracking-[0.2em] text-[#888] uppercase">Seats</p>
              <p className="text-xl font-black text-[#1a1a1a]">Unlimited</p>
            </div>
          </div>

          {/* ── Two-column: Plans + Members ── */}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-5 lg:gap-12">
            <section id="billing" className="lg:col-span-3">
              <h2 className="mb-4 text-sm font-bold uppercase">Local storage</h2>
              <p className="text-sm text-[#888]">
                This installation runs on your own server. All team features are available without a
                subscription.
              </p>
              <p className="mt-3 text-sm text-[#888]">
                The operator manages a shared disk budget for uploaded originals. Generated media
                uses additional space.
              </p>
            </section>

            {/* Members column */}
            <div id="members" className="scroll-mt-6 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-[10px] font-bold tracking-[0.2em] text-[#888] uppercase">
                  Members
                  <span className="ml-2 text-[#1a1a1a]">{members?.length || 0}</span>
                </h2>
                {isAdmin && (
                  <button
                    onClick={() => setMemberDialogOpen(true)}
                    className="text-xs font-bold tracking-wider text-[#2d5a2d] uppercase underline underline-offset-2 hover:text-[#3a6a3a]"
                  >
                    + Invite
                  </button>
                )}
              </div>

              <div className="border-t-2 border-[#1a1a1a]">
                {members?.slice(0, 8).map((member) => (
                  <div
                    key={member._id}
                    className="flex items-center justify-between border-b border-[#ccc] py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[#1a1a1a]">{member.userName}</p>
                      <p className="truncate text-xs text-[#888]">{member.userEmail}</p>
                    </div>
                    <span className="ml-3 shrink-0 text-[10px] font-bold tracking-[0.15em] text-[#888] uppercase">
                      {member.role}
                    </span>
                  </div>
                ))}
                {members && members.length > 8 && (
                  <button
                    onClick={() => setMemberDialogOpen(true)}
                    className="py-3 text-xs text-[#888] underline hover:text-[#1a1a1a]"
                  >
                    +{members.length - 8} more
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Danger zone ── */}
          {isOwner && (
            <div className="mt-16 flex items-center justify-between border-t-2 border-[#dc2626]/30 pt-6">
              <div>
                <p className="text-sm font-bold text-[#1a1a1a]">Delete team</p>
                <p className="mt-0.5 text-xs text-[#888]">
                  Permanently remove this team, all projects, and videos.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteTeam}
                disabled={!canDeleteTeam}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {isAdmin && (
        <MemberInvite
          teamId={team._id}
          open={memberDialogOpen}
          onOpenChange={setMemberDialogOpen}
        />
      )}
    </div>
  );
}
