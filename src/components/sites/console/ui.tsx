"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDenied } from "@/components/sites/console/console-provider";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

/** The VWS logo; the default size is the AWS console logo's 32x19. */
export function Mark({ className, width = 32, height = 19 }: { className?: string; width?: number; height?: number }) {
  return <Image src="/images/vws-logo.svg" alt="VWS" width={width} height={height} className={className} />;
}

type ExplainedProps = { id: string; reason: string; className?: string; children: ReactNode };

/** A disabled control and the reason, shown on hover, focus or tap as the AWS console explains a disabled action. */
function Explained({ id, reason, className, children }: ExplainedProps) {
  const [right, setRight] = useState(false);
  const place = (event: { currentTarget: HTMLElement }) =>
    setRight(event.currentTarget.getBoundingClientRect().left + 272 > window.innerWidth);
  return (
    <span
      tabIndex={0}
      className={cn("group/why relative inline-flex cursor-not-allowed [&>button]:pointer-events-none", className)}
      onMouseEnter={place}
      onFocus={place}
    >
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-full z-50 mt-1 hidden w-max max-w-64 rounded-md border border-[#e6e8eb] bg-white p-2 text-left text-[12px] font-normal leading-5 text-[#16191f] shadow-lg group-hover/why:block group-focus/why:block",
          right ? "right-0" : "left-0",
        )}
      >
        {reason}
      </span>
    </span>
  );
}

type Gated = {
  /** The capability action ("ec2:RunInstances") the control starts. A region that refuses it disables the control. */
  action?: string;
};

function GatedButton({ action, ...props }: React.ComponentProps<typeof Button> & Gated) {
  const why = useDenied()(action);
  const id = useId();
  if (why === null) return <Button {...props} />;
  return (
    <Explained id={id} reason={why}>
      <Button {...props} disabled aria-describedby={id} />
    </Explained>
  );
}

/** A plain button that starts `action`, for the controls that are not one of the console's styled buttons. */
export function ActionButton({ action, ...props }: React.ComponentProps<"button"> & Gated) {
  const why = useDenied()(action);
  const id = useId();
  if (why === null) return <button type="button" {...props} />;
  return (
    <Explained id={id} reason={why}>
      <button type="button" {...props} disabled aria-describedby={id} />
    </Explained>
  );
}

type ActionLinkProps = Gated & { href: string; className?: string; children: ReactNode };

/** A link that starts `action`; a region that refuses it gets a disabled button of the same look, with the reason. */
export function ActionLink({ action, ...link }: ActionLinkProps) {
  const why = useDenied()(action);
  const id = useId();
  if (why === null) return <Link {...link} />;
  return (
    <Explained id={id} reason={why}>
      <button type="button" disabled aria-describedby={id} className={cn(link.className, "opacity-50")}>
        {link.children}
      </button>
    </Explained>
  );
}

export function OrangeButton({ className, ...props }: React.ComponentProps<typeof GatedButton>) {
  return (
    <GatedButton
      {...props}
      className={cn(
        "h-8 rounded-lg border-transparent bg-[#ff9900] px-3 text-[13px] font-semibold text-[#16191f] shadow-none hover:bg-[#ec7211]",
        className,
      )}
    />
  );
}

export function OutlineButton({ className, ...props }: React.ComponentProps<typeof GatedButton>) {
  return (
    <GatedButton
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

export type MenuEntry = Gated & {
  label: string;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  checked?: boolean;
  dot?: string;
  hint?: string;
  reload?: boolean;
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
  const denied = useDenied();
  const menuId = useId();

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
          {items.map((item, index) => {
            const why = denied(item.action);
            const whyId = `${menuId}-${index}`;
            const content = (
              <span className={cn("flex items-center gap-2", item.hint && "whitespace-nowrap")}>
                <Check className={cn("size-3.5", item.checked ? "opacity-100" : "opacity-0")} />
                {item.dot ? (
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: item.dot }} />
                ) : null}
                {item.label}
                {item.hint ? <span className="ml-auto pl-4 text-[12px] text-[#5f6b7a]">{item.hint}</span> : null}
              </span>
            );
            if (item.href && !item.disabled && why === null) {
              const Anchor = item.reload ? "a" : Link;
              return (
                <Anchor
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  className="block px-3 py-1.5 hover:bg-[#f2f8fd]"
                  onClick={() => setOpen(false)}
                >
                  {content}
                </Anchor>
              );
            }
            const entry = (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled || why !== null}
                aria-describedby={why === null ? undefined : whyId}
                className="block w-full px-3 py-1.5 text-left hover:bg-[#f2f8fd] disabled:cursor-not-allowed disabled:text-[#8d9aa8] disabled:hover:bg-transparent"
                onClick={() => {
                  item.onSelect?.();
                  setOpen(false);
                }}
              >
                {content}
              </button>
            );
            if (why === null) return entry;
            return (
              <Explained key={item.label} id={whyId} reason={why} className="flex">
                {entry}
              </Explained>
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
