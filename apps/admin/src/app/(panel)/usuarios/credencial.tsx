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
      <p className="mt-3 text-sm text-amber-800">
        Se la pasás al vendedor en persona o por WhatsApp. La usa una sola vez, para configurar la
        app en su celular; después entra con su PIN.
      </p>
    </div>
  );
}
