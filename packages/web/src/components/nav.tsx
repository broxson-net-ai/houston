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
  { href: "/admin", label: "Admin" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b bg-card">
      <div className="container mx-auto px-4 flex items-center gap-6 h-14">
        <Link href="/board" className="font-bold text-lg">
          Houston
        </Link>
        <div className="flex items-center gap-4 flex-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                pathname?.startsWith(item.href)
                  ? "text-primary"
                  : "text-muted-foreground"
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
