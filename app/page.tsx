import { redirect } from "next/navigation";
import { checkSession } from "@/lib/auth";

export default function Home() {
  if (!checkSession()) {
    redirect("/login");
  }
  redirect("/compose");
}
