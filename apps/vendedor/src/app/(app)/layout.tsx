import type { ReactNode } from "react";
import { CandadoPin } from "@/components/candado-pin";
import { BarraInferior, EncabezadoSuperior } from "@/components/nav";
import { requerirVendedor } from "@/lib/auth";

export default async function LayoutApp({ children }: { children: ReactNode }) {
  const { nombre } = await requerirVendedor();

  return (
    <CandadoPin>
      <EncabezadoSuperior nombre={nombre} />
      <main className="mx-auto w-full max-w-lg flex-1 space-y-4 p-4 pb-20">{children}</main>
      <BarraInferior />
    </CandadoPin>
  );
}
