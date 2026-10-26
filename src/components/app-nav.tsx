"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { BarChart3, FlaskConical, ShieldCheck, SwatchBook, Upload, Rows3 } from "lucide-react";

const LINKS = [
  { href: "/upload", label: "Upload", icon: "upload" },
  { href: "/items", label: "Content", icon: "list" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/kit", label: "Brand kit", icon: "kit" },
  { href: "/evals", label: "Evals", icon: "evals" },
  { href: "/insights", label: "Insights", icon: "insights" },
] as const;

function Icon({ name, active }: { name: string; active?: boolean }) {
  const cls = `h-[15px] w-[15px]${active ? " text-primary" : " opacity-80"}`;
  return name === "upload" ? (
    <Upload className={cls} />
  ) : name === "list" ? (
    <Rows3 className={cls} />
  ) : name === "review" ? (
    <ShieldCheck className={cls} />
  ) : name === "evals" ? (
    <FlaskConical className={cls} />
  ) : name === "insights" ? (
    <BarChart3 className={cls} />
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
    <nav className="flex gap-1 lg:mt-1 lg:block lg:space-y-px">
      {LINKS.map((link) => (
        <span
          key={link.href}
          className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground/70 lg:py-[7px]"
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
    <nav className="flex gap-1 lg:mt-1 lg:block lg:space-y-px">
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
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors lg:py-[7px] ${
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
