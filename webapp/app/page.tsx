import { redirect } from "next/navigation";
import Link from "next/link";
import { checkSession } from "@/lib/auth";
import Nav from "@/components/Nav";

export default function Home() {
  if (!checkSession()) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-ink">
      <Nav />
      <main className="flex flex-col items-center justify-center px-6" style={{ minHeight: "calc(100vh - 52px)" }}>
        <p className="font-serif text-3xl text-white tracking-wide mb-1">Crawford Coaching</p>
        <p className="font-serif italic text-mist text-sm tracking-wider mb-12">
          Lead with Clarity. Live with Purpose.
        </p>

        <div className="flex gap-6">
          <Link
            href="/editions"
            className="flex flex-col items-center justify-center bg-slate rounded-sm px-10 py-10 transition-colors hover:border-brand-blue"
            style={{ border: "1px solid rgba(45,134,196,0.35)", width: 200 }}
          >
            <p className="font-sans text-xs tracking-widest uppercase text-mist mb-2">Draft</p>
            <p className="font-serif text-xl text-white">Newsletter</p>
          </Link>

          <Link
            href="/email"
            className="flex flex-col items-center justify-center bg-slate rounded-sm px-10 py-10 transition-colors hover:border-brand-blue"
            style={{ border: "1px solid rgba(45,134,196,0.35)", width: 200 }}
          >
            <p className="font-sans text-xs tracking-widest uppercase text-mist mb-2">Send</p>
            <p className="font-serif text-xl text-white">Email</p>
          </Link>
        </div>
      </main>
    </div>
  );
}
