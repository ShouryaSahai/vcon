import { redirect } from "next/navigation";

/**
 * The workspace landing is the content list — the screen people actually
 * work from. (The M0-era overview placeholder lived here; the sidebar
 * carries role/workspace context now.)
 */
export default function HomePage() {
  redirect("/items");
}
