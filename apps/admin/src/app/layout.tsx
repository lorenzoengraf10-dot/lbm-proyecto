import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "La Buena Medida — Panel",
  description: "Panel de administración de pedidos y cobertura de ruta",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
