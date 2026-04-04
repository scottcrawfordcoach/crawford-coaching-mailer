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

  const linkCls = (match: string) =>
    `font-sans text-xs tracking-widest uppercase transition-colors ${
      pathname.startsWith(match)
        ? "text-white"
        : "text-mist hover:text-pale"
    }`;

  return (
    <header className="bg-slate border-b border-fog px-6 py-3 flex items-center justify-between">
      <p className="font-serif text-lg text-white tracking-wide">Crawford Coaching</p>
      <nav className="flex items-center gap-8">
        <Link href="/" className={linkCls("/editions") || pathname === "/" ? "text-white font-sans text-xs tracking-widest uppercase" : "text-mist hover:text-pale font-sans text-xs tracking-widest uppercase"}>Editions</Link>
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
