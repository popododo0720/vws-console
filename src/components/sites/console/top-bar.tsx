"use client";

import { logoutAction } from "@/app/actions/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Bell, CircleQuestionMark, Globe, LayoutGrid, Search, Settings, SquareTerminal } from "lucide-react";
import { ADMIN_REGIONS_ACTION, adminNav, billingNav, linksIn, navTrees } from "@/lib/console-data";
import { ALL_REGIONS, regionLabel, type Region } from "@/lib/vws-api/adapter";
import { useConsole } from "@/components/sites/console/console-provider";
import { Mark, MenuButton, MenuChevron, PanelDialog, type MenuEntry } from "@/components/sites/console/ui";

const pageLinks = Array.from(
  new Map(
    [
      ...navTrees.flatMap((tree) => linksIn(tree)),
      { label: "Launch instance", href: "/compute/launch" },
      { label: billingNav.title, href: "/billing" },
    ].map((link) => [link.href, link]),
  ).values(),
);
const adminLinks = linksIn(adminNav);

/** The dot and the word for a region's state, in the colours the lists use for running, warning and stopped. */
const regionStates: Record<Region["state"], { dot: string; hint: string }> = {
  available: { dot: "#037f0c", hint: "Available" },
  degraded: { dot: "#8d6605", hint: "Degraded" },
  unavailable: { dot: "#d13212", hint: "Unavailable" },
};

export function TopBar({ onMenu }: { onMenu: () => void }) {
  const consoleApi = useConsole();
  const router = useRouter();
  const search = useSearchParams();
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ title: string; body: string } | null>(null);
  const links = useMemo(
    () => (consoleApi.adminActions.includes(ADMIN_REGIONS_ACTION) ? [...pageLinks, ...adminLinks] : pageLinks),
    [consoleApi.adminActions],
  );

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const pages = links
      .filter((link) => link.label.toLowerCase().includes(q))
      .map((link) => ({ label: link.label, detail: "Page", href: link.href }));
    const resources = [
      ...consoleApi.instances.map((item) => ({
        label: item.name || item.id,
        detail: item.id,
        href: "/compute/instances",
      })),
      ...consoleApi.volumes.map((item) => ({
        label: item.name || item.id,
        detail: item.id,
        href: "/storage/volumes",
      })),
      ...consoleApi.accountBuckets.map((item) => ({
        label: item.name,
        detail: "Bucket",
        href: `/storage/buckets/${encodeURIComponent(item.name)}`,
      })),
    ].filter((item) => `${item.label} ${item.detail}`.toLowerCase().includes(q));
    return [...pages, ...resources].slice(0, 8);
  }, [consoleApi.accountBuckets, consoleApi.instances, consoleApi.volumes, links, query]);

  /** A plain link, so choosing a region loads the page again and nothing of the old region stays on screen. */
  const regionEntry = (name: string, state?: Region["state"]): MenuEntry => {
    const params = new URLSearchParams(search.toString());
    params.set("region", name);
    return {
      label: regionLabel(name),
      href: `?${params}`,
      reload: true,
      checked: name === consoleApi.region,
      ...(state ? regionStates[state] : {}),
    };
  };
  const regionItems: MenuEntry[] = consoleApi.regionsError
    ? [
        { label: `Regions could not be loaded (${consoleApi.regionsError.code})`, disabled: true },
        { label: "Try again", onSelect: () => router.refresh() },
      ]
    : [regionEntry(ALL_REGIONS), ...consoleApi.regions.map((item) => regionEntry(item.name, item.state))];

  return (
    <header className="flex h-10 shrink-0 items-center gap-2 bg-[#161d26] px-3 text-white">
      <Link href="/compute/instances" className="flex shrink-0 items-center gap-2 pr-2">
        <Mark />
      </Link>
      <button
        type="button"
        className="grid size-8 place-items-center rounded-md text-[#d5dbdb] hover:bg-white/10 lg:hidden"
        aria-label="Open navigation"
        onClick={onMenu}
      >
        <LayoutGrid className="size-4" />
      </button>
      <div className="hidden lg:block">
        <MenuButton
          label={
            <span className="grid size-8 place-items-center rounded-md text-[#d5dbdb] hover:bg-white/10 hover:text-white">
              <LayoutGrid className="size-4" />
              <span className="sr-only">Services</span>
            </span>
          }
          items={links.map((link) => ({ label: link.label, href: link.href }))}
        />
      </div>
      <div className="relative mx-2 hidden min-w-0 flex-1 sm:block">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[#9aa4ad]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          aria-label="Search"
          className="h-8 w-full rounded-lg border border-white/10 bg-[#0f141a] pl-8 pr-2 text-[13px] text-white outline-none placeholder:text-[#9aa4ad] focus:border-[#006ce0]"
        />
        {hits.length > 0 ? (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-[#e6e8eb] bg-white text-[13px] text-[#16191f] shadow-lg">
            {hits.map((hit) => (
              <Link
                key={`${hit.href}-${hit.label}`}
                href={hit.href}
                className="flex items-center justify-between px-3 py-1.5 hover:bg-[#f2f8fd]"
                onClick={() => setQuery("")}
              >
                <span>{hit.label}</span>
                <span className="text-[12px] text-[#5f6b7a]">{hit.detail}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <div className="ml-auto flex items-center gap-0.5">
        <HeaderIcon
          label="Shell"
          onClick={() =>
            setNotice({
              title: "Shell",
              body: "The browser shell is not connected in this preview. Resource changes stay in this session.",
            })
          }
        >
          <SquareTerminal className="size-4" />
        </HeaderIcon>
        <HeaderIcon
          label="Notifications"
          onClick={() => setNotice({ title: "Notifications", body: "No notifications." })}
        >
          <Bell className="size-4" />
        </HeaderIcon>
        <MenuButton
          align="right"
          label={
            <span className="grid size-8 place-items-center rounded-md text-[#d5dbdb] hover:bg-white/10 hover:text-white">
              <Settings className="size-4" />
              <span className="sr-only">Settings</span>
            </span>
          }
          items={[
            {
              label: "Comfortable rows",
              checked: consoleApi.density === "comfortable",
              onSelect: () => consoleApi.setDensity("comfortable"),
            },
            {
              label: "Compact rows",
              checked: consoleApi.density === "compact",
              onSelect: () => consoleApi.setDensity("compact"),
            },
          ]}
        />
        <MenuButton
          align="right"
          label={
            <span className="grid size-8 place-items-center rounded-md text-[#d5dbdb] hover:bg-white/10 hover:text-white">
              <CircleQuestionMark className="size-4" />
              <span className="sr-only">Help</span>
            </span>
          }
          items={links.map((link) => ({ label: link.label, href: link.href }))}
        />
        <MenuButton
          align="right"
          className="ml-1 inline-flex h-8 items-center gap-1 rounded-md px-2 text-[13px] text-white hover:bg-white/10"
          label={
            <>
              <Globe className="size-3.5" />
              <span className="max-w-32 truncate">{consoleApi.region ? regionLabel(consoleApi.region) : "Region"}</span>
              <MenuChevron />
            </>
          }
          items={regionItems}
        />
        <MenuButton
          align="right"
          className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-right hover:bg-white/10"
          label={
            <>
              <span className="leading-tight">
                <span className="block text-[12px]">{consoleApi.account.name}</span>
                <span className="block text-[11px] text-[#c6c9ce]">{consoleApi.account.id}</span>
              </span>
              <MenuChevron />
            </>
          }
          items={[
            { label: consoleApi.account.name, disabled: true },
            { label: `Account ${consoleApi.account.id}`, disabled: true },
            {
              label: "Show empty account",
              checked: consoleApi.mode === "empty",
              onSelect: consoleApi.showEmpty,
            },
            {
              label: "Show sample data",
              checked: consoleApi.mode === "sample",
              onSelect: consoleApi.showSample,
            },
            ...(consoleApi.signIn ? [{ label: "Sign out", onSelect: () => void logoutAction() }] : []),
          ]}
        />
      </div>
      <PanelDialog open={notice !== null} title={notice?.title ?? ""} onClose={() => setNotice(null)}>
        <p>{notice?.body}</p>
      </PanelDialog>
    </header>
  );
}

function HeaderIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="grid size-8 place-items-center rounded-md text-[#d5dbdb] hover:bg-white/10 hover:text-white"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
