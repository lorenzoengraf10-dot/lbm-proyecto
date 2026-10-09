import type { CredencialGenerada } from "./tipos";

export function AvisoCredencial({ credencial }: { credencial: CredencialGenerada }) {
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-900">
        Anotá estos datos ahora: la contraseña no se puede volver a ver.
      </p>
      <dl className="mt-3 space-y-1 font-mono text-sm text-amber-900">
        <div className="flex gap-2">
          <dt className="w-24 text-amber-700">Usuario</dt>
          <dd className="font-semibold">{credencial.usuario}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 text-amber-700">Contraseña</dt>
          <dd className="font-semibold">{credencial.clave}</dd>
        </div>
      </dl>
      {/* Solo se genera para administradores: el repartidor entra con nombre y
          PIN, su app no tiene dónde escribir una contraseña. */}
      <p className="mt-3 text-sm text-amber-800">
        Se la pasás en persona o por WhatsApp. Con esto entra al panel tocando «Entrar con
        contraseña». Después conviene que se cargue un PIN desde su ficha, que reemplaza esta
        contraseña.
      </p>
    </div>
  );
}
