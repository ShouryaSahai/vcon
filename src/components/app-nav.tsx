"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Suspense,
  useEffect,
  useOptimistic,
  useTransition,
  type ReactNode,
} from "react";
import {
  BarChart3,
  FlaskConical,
  Rows3,
  ShieldCheck,
  SwatchBook,
  Upload,
} from "lucide-react";

const LINKS: ReadonlyArray<{ href: string; label: string; icon: string }> = [
  { href: "/upload", label: "Upload", icon: "upload" },
  { href: "/items", label: "Content", icon: "list" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/kit", label: "Brand kit", icon: "kit" },
  { href: "/evals", label: "Evals", icon: "evals" },
  { href: "/insights", label: "Insights", icon: "insights" },
];

function Icon({ name, active }: { name: string; active: boolean }) {
  const cls = `h-[15px] w-[15px] shrink-0 transition-transform duration-200 ${
    active
      ? "text-[#D95B40] scale-105"
      : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
  }`;

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

function NavList({ reviewBadge }: { reviewBadge?: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticPath, setOptimisticPath] = useOptimistic<string>(pathname);

  // Warm the client router cache for all 6 tabs immediately on mount
  useEffect(() => {
    LINKS.forEach((link) => {
      router.prefetch(link.href);
    });
  }, [router]);

  return (
    <nav className="flex flex-row items-center gap-1 lg:flex-col lg:items-stretch lg:gap-0.5">
      {LINKS.map((link) => {
        const active =
          optimisticPath === link.href ||
          (link.href !== "/" && optimisticPath.startsWith(`${link.href}/`));

        return (
          <Link
            key={link.href}
            href={link.href}
            prefetch={true}
            onMouseDown={(e) => {
              if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                startTransition(() => {
                  setOptimisticPath(link.href);
                  router.push(link.href);
                });
              }
            }}
            className={`group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-all duration-150 ${
              active
                ? "bg-white/[0.08] font-medium text-white shadow-2xs"
                : "font-normal text-sidebar-foreground/75 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <span
              className={`hidden lg:block absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-r-full transition-all duration-200 ${
                active
                  ? "bg-[#D95B40] opacity-100 scale-y-100"
                  : "bg-transparent opacity-0 scale-y-50"
              }`}
            />

            <Icon name={link.icon} active={active} />
            <span className="truncate">{link.label}</span>

            {link.href === "/review" && reviewBadge}

            {isPending && active && pathname !== link.href && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#D95B40] animate-ping" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppNav({ reviewBadge }: { reviewBadge?: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-row gap-1 lg:flex-col lg:gap-0.5">
          {LINKS.map((l) => (
            <div
              key={l.href}
              className="h-9 rounded-md bg-white/[0.03] px-2.5 py-2"
            />
          ))}
        </div>
      }
    >
      <NavList reviewBadge={reviewBadge} />
    </Suspense>
  );
}