import type { ReactNode } from "react";
import { Nav } from "@/components/nav";
import { requerirAdmin } from "@/lib/auth";

export default async function LayoutPanel({ children }: { children: ReactNode }) {
  const { nombre } = await requerirAdmin();

  return (
    <>
      <Nav nombre={nombre} />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 p-6">{children}</main>
    </>
  );
}
