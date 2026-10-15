"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

export function Mark({ className }: { className?: string }) {
  return <span className={cn("text-[15px] font-bold tracking-[0.18em] text-[#ff9900]", className)}>VWS</span>;
}

export function OrangeButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      {...props}
      className={cn(
        "h-8 rounded-lg border-transparent bg-[#ff9900] px-3 text-[13px] font-semibold text-[#16191f] shadow-none hover:bg-[#ec7211]",
        className,
      )}
    />
  );
}

export function OutlineButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      {...props}
      className={cn(
        "h-8 rounded-lg border-[#c6c9ce] bg-white px-3 text-[13px] font-semibold text-[#16191f] shadow-none hover:bg-[#f7f8f8]",
        className,
      )}
    />
  );
}

export const orangeLinkClass =
  "inline-flex h-8 items-center justify-center rounded-lg bg-[#ff9900] px-3 text-[13px] font-semibold text-[#16191f] hover:bg-[#ec7211]";

export function dash(value: string) {
  return value.trim() ? value : "—";
}

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#006ce0] hover:underline"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <Info className="size-3.5" />
        Info
      </button>
      {open ? (
        <span className="absolute left-0 top-full z-30 mt-1 w-64 rounded-md border border-[#e6e8eb] bg-white p-2 text-left text-[12px] font-normal leading-5 text-[#16191f] shadow-lg">
          {text}
        </span>
      ) : null}
    </span>
  );
}

export type MenuEntry = {
  label: string;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  checked?: boolean;
};

export function MenuButton({
  label,
  items,
  align = "left",
  className,
}: {
  label: ReactNode;
  items: MenuEntry[];
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={cn("inline-flex items-center border-0 bg-transparent p-0", className)}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
      </button>
      {open ? (
        <div
          className={cn(
            "absolute top-full z-40 mt-1 min-w-52 rounded-lg border border-[#e6e8eb] bg-white py-1 text-[13px] text-[#16191f] shadow-lg",
            align === "right" ? "right-0" : "left-0",
          )}
          role="menu"
        >
          {items.map((item) => {
            const content = (
              <span className="flex items-center gap-2">
                <Check className={cn("size-3.5", item.checked ? "opacity-100" : "opacity-0")} />
                {item.label}
              </span>
            );
            if (item.href && !item.disabled) {
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  className="block px-3 py-1.5 hover:bg-[#f2f8fd]"
                  onClick={() => setOpen(false)}
                >
                  {content}
                </Link>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className="block w-full px-3 py-1.5 text-left hover:bg-[#f2f8fd] disabled:cursor-not-allowed disabled:text-[#8d9aa8] disabled:hover:bg-transparent"
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                }}
              >
                {content}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function PanelDialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-lg rounded-xl border border-[#e6e8eb] bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#e6e8eb] px-4 py-3">
          <h2 className="text-[16px] font-semibold">{title}</h2>
          <button type="button" aria-label="Close" className="rounded p-1 hover:bg-[#f4f5f6]" onClick={onClose}>
            <X className="size-4" />
          </button>
        </div>
        <div className="px-4 py-3 text-[13px]">{children}</div>
        {footer ? <div className="flex justify-end gap-2 border-t border-[#e6e8eb] px-4 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function CopyText({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  if (!value) return <span>—</span>;
  return (
    <button
      type="button"
      className="text-left text-[#006ce0] hover:underline"
      onClick={async (event) => {
        event.stopPropagation();
        setStatus((await copyToClipboard(value, "copy-text")) ? "copied" : "failed");
        window.setTimeout(() => setStatus("idle"), 900);
      }}
    >
      {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : value}
    </button>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-[13px] font-semibold">{children}</label>;
}

export function menuTriggerClass() {
  return "inline-flex h-8 items-center gap-1 rounded-lg border border-[#c6c9ce] bg-white px-3 text-[13px] font-semibold text-[#16191f] hover:bg-[#f7f8f8]";
}

export function MenuChevron() {
  return <ChevronDown className="size-3.5 text-[#5f6b7a]" />;
}

export function SampleBadge() {
  return (
    <span
      className="rounded-full bg-[#f2f8fd] px-2 py-0.5 text-[11px] font-semibold text-[#006ce0]"
      title="Values on this screen come from the console's sample data set"
    >
      Sample data
    </span>
  );
}

export function DetailGrid({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-3">
      {items.map(([key, value]) => (
        <div key={key}>
          <dt className="font-semibold text-[#5f6b7a]">{key}</dt>
          <dd className="break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function blueMenuTriggerClass() {
  return "inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#006ce0] bg-white px-3 text-[13px] font-semibold text-[#006ce0] hover:bg-[#f2f8fd]";
}
