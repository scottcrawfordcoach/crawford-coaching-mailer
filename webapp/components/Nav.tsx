"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
  }

  const linkCls = (href: string) =>
    `font-sans text-xs tracking-widest uppercase transition-colors ${
      pathname === href || (href !== "/" && pathname.startsWith(href))
        ? "text-white"
        : "text-mist hover:text-pale"
    }`;

  return (
    <header className="bg-slate border-b border-fog px-6 py-3 flex items-center justify-between">
      <p className="font-serif text-lg text-white tracking-wide">Crawford Coaching</p>
      <nav className="flex items-center gap-8">
        <Link href="/" className={linkCls("/")}>Home</Link>
        <Link href="/editions" className={linkCls("/editions")}>Editions</Link>
        <Link href="/email" className={linkCls("/email")}>Email</Link>
        <button
          onClick={handleLogout}
          className="text-fog hover:text-mist font-sans text-xs tracking-widest uppercase transition-colors"
        >
          Sign Out
        </button>
      </nav>
    </header>
  );
}
