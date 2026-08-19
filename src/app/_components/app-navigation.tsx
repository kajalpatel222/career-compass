"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [{ href: "/", label: "Command Center" }, { href: "/listings", label: "Opportunities" }, { href: "/linkedin-listings", label: "LinkedIn Scan" }, { href: "/action-ops", label: "Next Actions" }, { href: "/planner", label: "Planner" }];

export function AppNavigation() {
  const pathname = usePathname();
  return <header className="sticky top-0 z-10 border-b border-[#DCE4F0] bg-[#F7F9FC]/95 px-5 py-4 backdrop-blur sm:px-10 lg:px-16"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><Link className="shrink-0 text-sm font-semibold tracking-[0.18em] text-[#0F766E] uppercase" href="/">Career Compass</Link><div className="min-w-0 overflow-x-auto"><nav aria-label="Main navigation" className="flex w-max rounded-full border border-[#DCE4F0] bg-white p-1">{links.map((link) => <Link className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${pathname === link.href ? "bg-[#0F766E] text-white" : "text-[#0F766E] hover:bg-[#EAF6F4]"}`} href={link.href} key={link.href}>{link.label}</Link>)}</nav></div></div></header>;
}
