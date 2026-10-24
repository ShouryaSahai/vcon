"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Upload, Rows3, ShieldCheck, SwatchBook } from "lucide-react";

const LINKS = [
  { href: "/upload", label: "Upload", icon: "upload" },
  { href: "/items", label: "Content", icon: "list" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/kit", label: "Brand kit", icon: "kit" },
] as const;

function Icon({ name, active }: { name: string; active?: boolean }) {
  const cls = `h-[15px] w-[15px]${active ? " text-primary" : " opacity-80"}`;
  return name === "upload" ? (
    <Upload className={cls} />
  ) : name === "list" ? (
    <Rows3 className={cls} />
  ) : name === "review" ? (
    <ShieldCheck className={cls} />
  ) : (
    <SwatchBook className={cls} />
  );
}

/**
 * Prerender-safe nav: the link list is in the static shell; the
 * pathname-dependent active state streams in behind a boundary (and after
 * hydration updates instantly on client navigations).
 */
export function AppNav({ reviewBadge }: { reviewBadge?: React.ReactNode }) {
  return (
    <Suspense fallback={<NavLinksStatic />}>
      <NavLinksDynamic reviewBadge={reviewBadge} />
    </Suspense>
  );
}

function NavLinksStatic() {
  return (
    <nav className="mt-1 space-y-px">
      {LINKS.map((link) => (
        <span
          key={link.href}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium text-sidebar-foreground/70"
        >
          <Icon name={link.icon} />
          {link.label}
        </span>
      ))}
    </nav>
  );
}

function NavLinksDynamic({ reviewBadge }: { reviewBadge?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <nav className="mt-1 space-y-px">
      {LINKS.map((link) => {
        const active =
          link.href === "/items"
            ? pathname === "/items" || pathname.startsWith("/items/")
            : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            }`}
          >
            <Icon name={link.icon} active={active} />
            {link.label}
            {link.href === "/review" && reviewBadge}
          </Link>
        );
      })}
    </nav>
  );
}
