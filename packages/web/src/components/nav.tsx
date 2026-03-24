"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/board", label: "Board" },
  { href: "/agents", label: "Agents" },
  { href: "/templates", label: "Templates" },
  { href: "/projects", label: "Projects" },
  { href: "/skills", label: "Skills" },
  { href: "/approvals", label: "Approvals" },
  { href: "/traces", label: "Traces" },
  { href: "/admin", label: "Admin" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto flex h-14 items-center gap-6 px-4">
        <Link href="/board" className="text-lg font-bold">
          Houston
        </Link>
        <div className="flex flex-1 items-center gap-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                pathname?.startsWith(item.href) ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-sm text-muted-foreground hover:text-primary"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
