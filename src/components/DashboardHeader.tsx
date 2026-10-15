import { Link, useParams } from "@tanstack/react-router";
import { UserMenu } from "@/lib/auth";
import { Moon, Search, Sun } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeToggle";
import React from "react";
import { useConvex } from "convex/react";
import type { Id } from "@convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useRoutePrewarmIntent } from "@/lib/useRoutePrewarmIntent";
import { useCommandPalette } from "@/lib/commandPalette";
import { useFolderDropTarget } from "@/lib/dnd/useFolderDropTarget";
import type { FolderNode } from "@/lib/folderTree";
import type { DragPayload } from "@/lib/dnd/payload";
import { prewarmDashboardIndex } from "../../app/routes/dashboard/-index.data";
import { TeamSwitcher } from "@/components/teams/TeamSwitcher";

function SearchButton() {
  const palette = useCommandPalette();
  const { mounted } = useTheme();
  if (!palette) return null;

  // Decided after mount so server and client markup match; the fixed width
  // keeps the header from shifting when it appears.
  const shortcut = !mounted ? "" : /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K";

  return (
    <button
      type="button"
      onClick={() => palette.setOpen(true)}
      className="flex h-10 items-center gap-2 border-2 border-(--border-subtle) px-2 font-mono text-xs text-[#888] transition-colors hover:border-(--border)! hover:text-[#1a1a1a]"
      aria-label="Search"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden xl:inline">Search</span>
      <kbd className="hidden w-[6ch] text-center font-mono sm:inline-block">{shortcut}</kbd>
    </button>
  );
}

function ThemeToggleButton() {
  const { theme, toggleTheme, mounted } = useTheme();

  if (!mounted) return <div className="h-8 w-8" />;

  return (
    <button
      onClick={toggleTheme}
      className="flex h-8 w-8 items-center justify-center text-[#888] transition-colors hover:bg-[#e8e8e0] hover:text-[#1a1a1a]"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode (⌘⇧L)`}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/** Makes a breadcrumb segment a drop target so items can be dragged "up" the
 * tree onto an ancestor (or the team root for top level), file-manager style. */
export type BreadcrumbDrop = {
  teamId: Id<"teams">;
  /** Destination folder; omit for "top level" (folders only). */
  targetProjectId?: Id<"projects">;
  /** Team folder list, for the folder-into-descendant guard. */
  folders?: readonly FolderNode[];
  disabled?: boolean;
  onDropMove: (payload: DragPayload) => void;
};

export type PathSegment = {
  label: React.ReactNode;
  href?: string;
  prewarmIntentHandlers?: ReturnType<typeof useRoutePrewarmIntent>;
  drop?: BreadcrumbDrop;
};

function BreadcrumbSegment({
  path,
  className,
  hideSeparatorOnPhone = false,
}: {
  path: PathSegment;
  className?: string;
  hideSeparatorOnPhone?: boolean;
}) {
  const { ref, isDraggedOver, canDropHere } = useFolderDropTarget<HTMLDivElement>({
    disabled: !path.drop || path.drop.disabled,
    targetProjectId: path.drop?.targetProjectId,
    teamId: path.drop?.teamId as Id<"teams">,
    folders: path.drop?.folders,
    onMove: (payload) => path.drop?.onDropMove(payload),
  });

  return (
    <div
      ref={ref}
      className={cn(
        "flex min-w-0 items-center",
        className,
        isDraggedOver && canDropHere && "bg-[#2d5a2d]/10 text-[#2d5a2d]",
        isDraggedOver && !canDropHere && "bg-[#dc2626]/10",
      )}
    >
      <span
        className={cn("mr-2 flex-shrink-0 text-[#888]", hideSeparatorOnPhone && "hidden sm:inline")}
      >
        /
      </span>
      {path.href ? (
        <Link
          to={path.href}
          preload="intent"
          className={cn(
            "mr-2 truncate transition-colors hover:text-[#2d5a2d]",
            isDraggedOver && canDropHere && "text-[#2d5a2d] underline",
          )}
          {...path.prewarmIntentHandlers}
        >
          {path.label}
        </Link>
      ) : (
        <div className="mr-2 flex min-w-0 items-center gap-3 py-2">
          {typeof path.label === "string" ? (
            <span className="truncate">{path.label}</span>
          ) : (
            path.label
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardHeader({
  children,
  paths = [],
}: {
  children?: React.ReactNode;
  paths?: PathSegment[];
}) {
  const convex = useConvex();
  const prewarmHomeIntentHandlers = useRoutePrewarmIntent(() => prewarmDashboardIndex(convex));
  // On team routes the first crumb is the team. Phones drop the logo so the team
  // and current crumbs keep the room.
  const onTeamRoute = typeof useParams({ strict: false }).teamSlug === "string";
  const [first, ...rest] = paths;
  const middle = rest.slice(0, -1);
  const current = rest.at(-1);

  return (
    <header className="grid flex-shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center border-b-2 border-[#1a1a1a] bg-[#f0f0e8] px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
      {/* Breadcrumb */}
      <div className="flex min-h-11 min-w-0 items-center overflow-hidden text-xl font-black tracking-tighter text-[#1a1a1a] sm:min-h-14">
        <Link
          to="/dashboard"
          preload="intent"
          className={cn(
            "mr-2 flex-shrink-0 transition-colors hover:text-[#2d5a2d]",
            onTeamRoute && "hidden sm:inline",
          )}
          {...prewarmHomeIntentHandlers}
        >
          lawn.
        </Link>
        {first && (
          <BreadcrumbSegment
            path={first}
            hideSeparatorOnPhone={onTeamRoute}
            // Capped instead of flex-shrunk so it never picks up a stray sub-pixel
            // ellipsis; when it is the only crumb it is the current one and shrinks.
            className={current ? "max-w-32 shrink-0 sm:max-w-52" : "shrink"}
          />
        )}
        {first && <TeamSwitcher />}
        {middle.length > 0 && (
          // Grows from zero into whatever room is left, so middle folders truncate
          // first and the current crumb only shrinks once each is down to "/ X…".
          <div
            className="hidden max-w-max grow basis-0 overflow-hidden sm:flex"
            style={{ minWidth: `${middle.length * 3}rem` }}
          >
            {middle.map((path, index) => (
              <BreadcrumbSegment key={index} path={path} className="min-w-12 shrink" />
            ))}
          </div>
        )}
        {current && <BreadcrumbSegment path={current} className="shrink" />}
      </div>

      {/* User controls — pinned top-right */}
      <div className="col-start-2 row-start-1 flex h-8 items-center gap-4 border-l-2 border-[#1a1a1a]/10 pl-4 lg:col-start-3">
        <SearchButton />
        <ThemeToggleButton />
        <UserMenu />
      </div>

      {/* Children — own row below lg so the breadcrumb keeps its width, middle column on desktop */}
      {children && (
        <div className="scrollbar-hidden col-span-full flex min-w-0 items-center gap-2 overflow-x-auto pb-2 sm:gap-3 lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:h-14 lg:px-4 lg:pb-0 [&>*]:shrink-0 lg:[&>*:first-child]:ml-auto">
          {children}
        </div>
      )}
    </header>
  );
}
