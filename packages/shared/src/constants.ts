import type { ConfiguracionClave } from "./types.js";

// Valores iniciales de semilla. En tiempo de ejecución la fuente de verdad
// es la tabla `configuracion` (editable por el admin sin redeploy).
export const CONFIGURACION_SEED: Record<ConfiguracionClave, string> = {
  tasa_comision_default: "3",
  pin_length: "4",
  max_intentos_pin: "5",
};
