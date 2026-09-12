"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { LARGO_PIN } from "@lbm/shared";
import { BotonEnviar } from "@/components/boton-enviar";
import { TecladoPin } from "@/components/teclado-pin";
import { Campo, Mensaje, estilos } from "@/components/ui";
import { entrarConPin, iniciarSesion, type EstadoLogin } from "./actions";

const ESTADO_INICIAL: EstadoLogin = { error: null };
const CLAVE_RECORDADO = "lbm_admin_recordado";

interface Admin {
  id: string;
  nombre: string;
}

export function FormularioLogin({ admins }: { admins: Admin[] }) {
  const [elegido, setElegido] = useState<Admin | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, empezar] = useTransition();
  // El camino de respaldo: al dueño nadie le puede resetear el PIN, así que
  // tiene que poder entrar con la contraseña si se lo olvida o queda bloqueado.
  const [conPassword, setConPassword] = useState(false);

  useEffect(() => {
    let recordado: Admin | null = null;
    try {
      const guardado = localStorage.getItem(CLAVE_RECORDADO);
      recordado = admins.find((a) => a.id === guardado) ?? null;
    } catch {
      // Sin localStorage se elige el nombre a mano, nada más.
    }
    const inicial = recordado ?? (admins.length === 1 ? admins[0] : null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (inicial) setElegido(inicial);
  }, [admins]);

  function cambiarPin(nuevo: string) {
    setPin(nuevo);
    setError(null);
    if (nuevo.length !== LARGO_PIN || !elegido || entrando) return;

    empezar(async () => {
      const resultado = await entrarConPin(elegido.id, nuevo);
      // Si entró, la action redirige y esto no llega a correr.
      setPin("");
      setError(resultado.error);
    });
  }

  function elegir(admin: Admin) {
    setElegido(admin);
    setPin("");
    setError(null);
    try {
      localStorage.setItem(CLAVE_RECORDADO, admin.id);
    } catch {
      // Solo es una comodidad.
    }
  }

  if (conPassword || admins.length === 0) {
    return <FormularioPassword alVolver={admins.length > 0 ? () => setConPassword(false) : null} />;
  }

  if (!elegido) {
    return (
      <div className="space-y-4">
        <p className="text-center text-sm text-stone-500">¿Quién sos?</p>
        {admins.map((admin) => (
          <button
            key={admin.id}
            type="button"
            onClick={() => elegir(admin)}
            className={`w-full ${estilos.botonSecundario} py-3 text-base`}
          >
            {admin.nombre}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-sm text-stone-500">Hola, {elegido.nombre}</p>
        <p className="font-semibold text-stone-900">Ingresá tu PIN</p>
      </div>

      <TecladoPin valor={pin} onCambiar={cambiarPin} largo={LARGO_PIN} disabled={entrando} />

      {error ? <Mensaje tipo="error">{error}</Mensaje> : null}

      <div className="space-y-2 text-center">
        {admins.length > 1 ? (
          <button
            type="button"
            onClick={() => setElegido(null)}
            className="block w-full text-sm text-stone-500 underline hover:text-stone-900"
          >
            No soy {elegido.nombre}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => setConPassword(true)}
          className="block w-full text-sm text-stone-500 underline hover:text-stone-900"
        >
          Entrar con contraseña
        </button>
      </div>
    </div>
  );
}

/** El login de siempre. Queda como respaldo del PIN, no como camino normal. */
function FormularioPassword({ alVolver }: { alVolver: (() => void) | null }) {
  const [estado, accion] = useActionState(iniciarSesion, ESTADO_INICIAL);

  return (
    <form action={accion} className="space-y-4">
      <Campo etiqueta="Usuario">
        <input
          name="usuario"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          required
          className={estilos.input}
        />
      </Campo>

      <Campo etiqueta="Contraseña">
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={estilos.input}
        />
      </Campo>

      {estado.error ? <Mensaje tipo="error">{estado.error}</Mensaje> : null}

      <BotonEnviar>Entrar</BotonEnviar>

      {alVolver ? (
        <button
          type="button"
          onClick={alVolver}
          className="block w-full text-sm text-stone-500 underline hover:text-stone-900"
        >
          Volver al PIN
        </button>
      ) : null}
    </form>
  );
}
