"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, RefreshCw, Search, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useConsole } from "@/components/sites/console/console-provider";
import { MenuButton, MenuChevron } from "@/components/sites/console/ui";

export type Column<T> = {
  key: string;
  header: string;
  minWidth: number;
  sortValue: (row: T) => string;
  cell: (row: T) => ReactNode;
};

type Preset<T> = {
  id: string;
  label: string;
  match: (row: T) => boolean;
};

export function ResourceTable<T>({
  rows,
  getId,
  columns,
  selectedIds,
  onSelectedIds,
  emptyTitle,
  emptyMessage,
  emptyAction,
  presets = [],
  filterPlaceholder,
  initialSort = null,
  onRefresh,
  hideRefresh = false,
  className,
  bodyClassName,
}: {
  rows: T[];
  getId: (row: T) => string;
  columns: Column<T>[];
  selectedIds: string[];
  onSelectedIds: (ids: string[]) => void;
  emptyTitle: string;
  emptyMessage: string;
  emptyAction?: { label: string; href?: string; onClick?: () => void };
  presets?: Preset<T>[];
  filterPlaceholder: string;
  initialSort?: { key: string; dir: "asc" | "desc" } | null;
  onRefresh?: () => void;
  hideRefresh?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  const { density } = useConsole();
  const [query, setQuery] = useState("");
  const [preset, setPreset] = useState("");
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const allRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const presetMatch = presets.find((item) => item.id === preset)?.match;
    const next = rows.filter((row) => {
      if (presetMatch && !presetMatch(row)) return false;
      if (!query) return true;
      return columns
        .map((column) => column.sortValue(row))
        .join("\n")
        .includes(query);
    });
    if (!sort) return next;
    const column = columns.find((item) => item.key === sort.key);
    if (!column) return next;
    return [...next].sort((a, b) => {
      const result = column.sortValue(a).localeCompare(column.sortValue(b), undefined, { numeric: true });
      return sort.dir === "asc" ? result : -result;
    });
  }, [columns, preset, presets, query, rows, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const visibleIds = visible.map(getId);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const someChecked = visibleIds.some((id) => selectedIds.includes(id));

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someChecked && !allChecked;
  }, [allChecked, someChecked]);

  const toggleSort = (key: string) => {
    setSort((current) => {
      if (current?.key !== key) return { key, dir: "asc" };
      if (current.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col px-4 pb-2", className)}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {presets.length > 0 ? (
          <label className="relative">
            <span className="absolute -top-2 left-2 z-[1] bg-white px-1 text-[10.5px] font-semibold leading-none text-[#5f6b7a]">
              Saved filter sets
            </span>
            <select
              className="field fit appearance-none pr-8"
              value={preset}
              onChange={(event) => {
                setPreset(event.target.value);
                setPage(0);
              }}
            >
              <option value="">Choose filter set</option>
              {presets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-[#5f6b7a]" />
          </label>
        ) : null}
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[#5f6b7a]" />
          <input
            className="field w-full"
            style={{ paddingLeft: 32 }}
            value={query}
            placeholder={filterPlaceholder}
            aria-label={filterPlaceholder}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
          />
        </div>
        {hideRefresh ? null : (
          <button
            type="button"
            aria-label="Refresh"
            className="grid size-8 place-items-center rounded-lg border border-[#c6c9ce] bg-white hover:bg-[#f7f8f8]"
            onClick={() => {
              setQuery("");
              setPreset("");
              setSort(initialSort);
              setPage(0);
              onRefresh?.();
            }}
          >
            <RefreshCw className="size-3.5" />
          </button>
        )}
        <div className="flex items-center gap-1 text-[13px]">
          <button
            type="button"
            aria-label="Previous page"
            className="grid size-7 place-items-center rounded hover:bg-[#f4f5f6] disabled:opacity-40"
            disabled={safePage === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            ‹
          </button>
          <span>{safePage + 1}</span>
          <button
            type="button"
            aria-label="Next page"
            className="grid size-7 place-items-center rounded hover:bg-[#f4f5f6] disabled:opacity-40"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((value) => value + 1)}
          >
            ›
          </button>
        </div>
        <MenuButton
          align="right"
          label={
            <span className="grid size-8 place-items-center rounded-lg border border-[#c6c9ce] bg-white hover:bg-[#f7f8f8]">
              <Settings className="size-3.5" />
              <span className="sr-only">Table preferences</span>
            </span>
          }
          items={[
            { label: "Clear sort", onSelect: () => setSort(null) },
            { label: `${filtered.length} shown`, disabled: true },
          ]}
        />
      </div>
      <div className={cn("relative flex min-h-0 flex-1 flex-col", bodyClassName)}>
        <div
          className={cn(
            "overflow-auto rounded-md border border-[#e6e8eb]",
            filtered.length === 0 ? "shrink-0" : "min-h-0 flex-1",
          )}
        >
          <table className="w-max min-w-full border-collapse text-left text-[13px]">
            <thead className="sticky top-0 z-[1] bg-white">
              <tr className="border-b border-[#e6e8eb] text-[12px] text-[#5f6b7a]">
                <th className="w-10 px-2 py-2">
                  <input
                    ref={allRef}
                    type="checkbox"
                    aria-label="Select all on this page"
                    checked={allChecked}
                    onChange={() => {
                      if (allChecked) onSelectedIds(selectedIds.filter((id) => !visibleIds.includes(id)));
                      else onSelectedIds(Array.from(new Set([...selectedIds, ...visibleIds])));
                    }}
                  />
                </th>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className="border-l border-[#e6e8eb] px-2 py-2 font-semibold first:border-l-0"
                    style={{ minWidth: column.minWidth }}
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1"
                      onClick={() => toggleSort(column.key)}
                    >
                      {column.header}
                      {sort?.key === column.key ? (
                        sort.dir === "asc" ? (
                          <ChevronUp className="size-3" />
                        ) : (
                          <ChevronDown className="size-3" />
                        )
                      ) : (
                        <MenuChevron />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const id = getId(row);
                const selected = selectedIds.includes(id);
                return (
                  <tr
                    key={id}
                    className={cn(
                      "cursor-pointer border-b border-[#eaeded] hover:bg-[#f7fbff]",
                      selected && "bg-[#e8f3fc]",
                      density === "compact" ? "[&>td]:py-1" : "[&>td]:py-1.5",
                    )}
                    onClick={() => onSelectedIds([id])}
                  >
                    <td className="px-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${id}`}
                        checked={selected}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => {
                          onSelectedIds(selected ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
                        }}
                      />
                    </td>
                    {columns.map((column) => (
                      <td key={column.key} className="px-2 whitespace-nowrap">
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? (
          <div className="flex min-h-[150px] flex-1 flex-col items-center justify-center px-6 py-8 text-center">
            <p className="font-semibold">{rows.length === 0 ? emptyTitle : "No matches"}</p>
            <p className="mt-1 max-w-md text-[13px] text-[#5f6b7a]">
              {rows.length === 0 ? emptyMessage : "Nothing matches the current filter."}
            </p>
            {rows.length === 0 && emptyAction ? (
              emptyAction.href ? (
                <Link
                  href={emptyAction.href}
                  className="mt-4 inline-flex h-8 items-center rounded-lg border border-[#c6c9ce] bg-white px-3 text-[13px] font-semibold text-[#16191f] hover:bg-[#f7f8f8]"
                >
                  {emptyAction.label}
                </Link>
              ) : (
                <button
                  type="button"
                  className="mt-4 inline-flex h-8 items-center rounded-lg border border-[#c6c9ce] bg-white px-3 text-[13px] font-semibold text-[#16191f] hover:bg-[#f7f8f8]"
                  onClick={emptyAction.onClick}
                >
                  {emptyAction.label}
                </button>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function NameCell({ value, onRename }: { value: string; onRename?: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  if (!onRename) return <span>{value.trim() ? value : "—"}</span>;
  if (editing) {
    return (
      <input
        className="field h-7"
        value={text}
        autoFocus
        aria-label="Name"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          onRename(text.trim());
          setEditing(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onRename(text.trim());
            setEditing(false);
          }
          if (event.key === "Escape") {
            setText(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <span>{value.trim() ? value : "—"}</span>
      <button
        type="button"
        aria-label="Edit name"
        className="rounded p-0.5 text-[#5f6b7a] hover:bg-[#f4f5f6] hover:text-[#16191f]"
        onClick={(event) => {
          event.stopPropagation();
          setText(value);
          setEditing(true);
        }}
      >
        <PencilIcon />
      </button>
    </span>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
      <path
        d="M11.2 1.8a1.2 1.2 0 0 1 1.7 1.7L5.4 11.1 3 12.2l1.1-2.4 7.1-8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}
