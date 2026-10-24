"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  upload: (
    <path d="M12 15V4m0 0L8 8m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  ),
  list: <path d="M4 6h16M4 12h16M4 18h10" />,
  review: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  kit: <path d="M12 3l8 5-8 13L4 8l8-5z" />,
};

const LINKS = [
  { href: "/upload", label: "Upload", icon: "upload" },
  { href: "/items", label: "Content", icon: "list" },
  { href: "/review", label: "Review", icon: "review" },
  { href: "/kit", label: "Brand kit", icon: "kit" },
] as const;

export function AppNav({ reviewCount }: { reviewCount: number }) {
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
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={active ? "text-primary" : "opacity-80"}
            >
              {ICONS[link.icon]}
            </svg>
            {link.label}
            {link.href === "/review" && reviewCount > 0 && (
              <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-sidebar-primary-foreground">
                {reviewCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
