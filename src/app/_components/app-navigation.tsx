"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [{ href: "/", label: "Command Center" }, { href: "/listings", label: "Opportunities" }, { href: "/linkedin-listings", label: "LinkedIn Scan" }, { href: "/action-ops", label: "Next Actions" }];

export function AppNavigation() {
  const pathname = usePathname();
  return <header className="sticky top-0 z-10 border-b border-[#dbe5d8] bg-[#f6f7f2]/95 px-6 py-4 backdrop-blur sm:px-10 lg:px-16"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3"><Link className="text-sm font-semibold tracking-[0.18em] text-[#47715b] uppercase" href="/">Career Compass</Link><nav aria-label="Main navigation" className="flex rounded-full border border-[#dbe5d8] bg-white p-1">{links.map((link) => <Link className={`rounded-full px-4 py-2 text-sm font-semibold transition ${pathname === link.href ? "bg-[#2f6047] text-white" : "text-[#47715b] hover:bg-[#f3f7f0]"}`} href={link.href} key={link.href}>{link.label}</Link>)}</nav></div></header>;
}
