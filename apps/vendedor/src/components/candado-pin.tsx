"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cerrarSesion } from "@/lib/sesion";
import { borrarPin, configurarPin, hayPinConfigurado, verificarPin, LARGO_PIN } from "@/lib/pin";
import { estilos } from "./ui";
import { TecladoPin } from "./teclado-pin";

const CLAVE_DESBLOQUEADO = "lbm_vendedor_desbloqueado";

type Estado =
  | { paso: "verificando" }
  | { paso: "elegir-pin" }
  | { paso: "confirmar-pin"; primerPin: string; error: string | null }
  | { paso: "bloqueado"; error: string | null }
  | { paso: "desbloqueado" };

/**
 * Capa de desbloqueo rápido delante de una sesión que YA es válida en el
 * servidor (requerirVendedor ya la comprobó antes de llegar acá). No es
 * autenticación: es una conveniencia para no reescribir la contraseña real
 * varias veces por día. Ver docs/PLAN.md §2.1 para el diseño completo.
 */
export function CandadoPin({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ paso: "verificando" });
  const [valor, setValor] = useState("");

  useEffect(() => {
    // El estado inicial depende de sessionStorage/localStorage, que no
    // existen en el render de servidor: arranca en "verificando" (no
    // renderiza nada) para que el primer render del cliente coincida con el
    // del servidor, y acá — ya montado, sin riesgo de mismatch de hidratación
    // — se corrige con el valor real. No es un "sync" con un sistema externo
    // en el sentido que busca la regla, es una inicialización que solo puede
    // pasar en el cliente.
    let inicial: Estado;
    if (sessionStorage.getItem(CLAVE_DESBLOQUEADO) === "1") {
      inicial = { paso: "desbloqueado" };
    } else if (hayPinConfigurado()) {
      inicial = { paso: "bloqueado", error: null };
    } else {
      inicial = { paso: "elegir-pin" };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstado(inicial);
  }, []);

  function desbloquear() {
    try {
      sessionStorage.setItem(CLAVE_DESBLOQUEADO, "1");
    } catch {
      // Sin sessionStorage vuelve a pedir el PIN en la próxima página, no es grave.
    }
    setEstado({ paso: "desbloqueado" });
  }

  async function alCompletarPin(pin: string) {
    if (estado.paso === "elegir-pin") {
      setValor("");
      setEstado({ paso: "confirmar-pin", primerPin: pin, error: null });
      return;
    }

    if (estado.paso === "confirmar-pin") {
      if (pin !== estado.primerPin) {
        setValor("");
        setEstado({ paso: "elegir-pin" });
        return;
      }
      await configurarPin(pin);
      setValor("");
      desbloquear();
      return;
    }

    if (estado.paso === "bloqueado") {
      const resultado = await verificarPin(pin);
      setValor("");
      if (resultado.ok) {
        desbloquear();
      } else if (resultado.intentosRestantes > 0) {
        setEstado({
          paso: "bloqueado",
          error: `PIN incorrecto. Te quedan ${resultado.intentosRestantes} intentos.`,
        });
      } else {
        await cerrarSesion();
      }
    }
  }

  function cambiarValor(nuevoValor: string) {
    setValor(nuevoValor);
    if (nuevoValor.length === LARGO_PIN) {
      void alCompletarPin(nuevoValor);
    }
  }

  async function olvidoPin() {
    borrarPin();
    await cerrarSesion();
  }

  if (estado.paso === "verificando") {
    return null;
  }

  if (estado.paso === "desbloqueado") {
    return <>{children}</>;
  }

  const titulo =
    estado.paso === "elegir-pin"
      ? "Elegí un PIN de 4 dígitos"
      : estado.paso === "confirmar-pin"
        ? "Repetí el PIN"
        : "Ingresá tu PIN";

  const ayuda =
    estado.paso === "elegir-pin"
      ? "Lo vas a usar para entrar rápido de acá en adelante, en vez de la contraseña."
      : null;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className={`${estilos.tarjeta} w-full max-w-xs space-y-6 p-6 text-center`}>
        <div>
          <h1 className="text-lg font-semibold text-stone-900">{titulo}</h1>
          {ayuda ? <p className="mt-1 text-sm text-stone-500">{ayuda}</p> : null}
        </div>

        <TecladoPin valor={valor} onCambiar={cambiarValor} largo={LARGO_PIN} />

        {"error" in estado && estado.error ? (
          <p role="alert" className="text-sm text-red-700">
            {estado.error}
          </p>
        ) : null}

        {estado.paso === "bloqueado" ? (
          <button
            type="button"
            onClick={() => void olvidoPin()}
            className="text-sm text-stone-500 underline hover:text-stone-900"
          >
            ¿Olvidaste el PIN?
          </button>
        ) : null}
      </div>
    </main>
  );
}
