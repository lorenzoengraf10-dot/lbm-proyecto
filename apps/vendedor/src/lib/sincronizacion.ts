"use client";

import { explicarErrorDeBase, numeroDeLaBase, ordenarPorCodigo } from "@lbm/shared";
import { crearClienteNavegador } from "./supabase-browser";
import {
  encolar,
  encolarEstado,
  guardarCatalogo,
  guardarDeudas,
  guardarPerfil,
  guardarUltimosPedidos,
  leerCola,
  leerColaEstados,
  leerDuenio,
  quitarDeCola,
  quitarEstadoDeCola,
  type CambioEstadoPendiente,
  type DeudaLocal,
  type PendienteCola,
} from "./almacen-local";

// Los mensajes de la base van en castellano: el repartidor los lee en el
// celular, parado en la puerta del comercio (ver explicarErrorDeBase).
const enCastellano = explicarErrorDeBase;

/**
 * ¿Falló la conexión, o el servidor rechazó el pedido?
 *
 * No es lo mismo y antes se trataban igual. Con señal débil —lo normal en la
 * calle— la subida fallaba por red, la pantalla decía "No se pudo cargar",
 * el repartidor volvía a tocar Confirmar y quedaban DOS pedidos en la cola,
 * que subían los dos al volver la señal.
 *
 * status 0 es una conexión que ni llegó (así lo informa supabase-js); 5xx es
 * el servidor caído o la base en pausa; 401 es la sesión vencida, que se
 * renueva sola con señal; 408 y 429 son "probá de nuevo". Nada de eso dice
 * que el pedido esté mal. Un rechazo de verdad (comercio dado de baja,
 * producto que ya no existe) llega como 400.
 */
function esFallaPasajera(status: number): boolean {
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

/**
 * El usuario de la sesión guardada en el celular. getSession lee lo local,
 * así que contesta igual sin señal.
 */
async function usuarioDeLaSesion(): Promise<string | null> {
  const {
    data: { session },
  } = await crearClienteNavegador().auth.getSession();
  return session?.user.id ?? null;
}

/**
 * ¿Este pendiente es de quien tiene la sesión abierta? Los cargados antes de
 * que la cola anotara el dueño son del dueño guardado del celular.
 */
function esDe(
  pendiente: { vendedorId?: string },
  usuarioId: string,
  duenioGuardado: string | null
): boolean {
  return (pendiente.vendedorId ?? duenioGuardado) === usuarioId;
}

/** Qué pasó con lo que el vendedor acaba de cargar. */
export type ResultadoCarga =
  | { estado: "subido" }
  | { estado: "en-cola" }
  | { estado: "rechazado"; motivo: string };

/**
 * Todo lo que el vendedor carga pasa primero por la cola local y recién
 * después sube. Con señal la subida tarda un parpadeo; sin señal queda
 * esperando y se reintenta sola. Es un solo camino para los dos casos, en vez
 * de un "modo offline" aparte que se prueba poco y se rompe callado.
 *
 * Devuelve qué pasó con ESTA carga (no con toda la cola): antes avisaba
 * "Pedido cargado" incluso cuando el servidor lo había rechazado, y el
 * vendedor se iba del comercio creyendo que el pedido estaba.
 */
export async function registrarPendiente(pendiente: PendienteCola): Promise<ResultadoCarga> {
  await encolar({ ...pendiente, vendedorId: (await usuarioDeLaSesion()) ?? undefined });
  const { errores } = await sincronizar();

  const propio = errores.get(pendiente.visitaId);
  if (propio) {
    // Rechazado en el momento, con el repartidor todavía frente al formulario
    // y las cantidades cargadas: se saca de la cola. Si se quedaba, reintentaba
    // para siempre sin poder sacarse, y si él lo volvía a cargar cuando se
    // arreglaba la causa (le reactivaban el comercio), subían los dos.
    await quitarDeCola(pendiente.visitaId);
    return { estado: "rechazado", motivo: propio };
  }

  const sigueEnCola = (await leerCola()).some((p) => p.visitaId === pendiente.visitaId);
  return sigueEnCola ? { estado: "en-cola" } : { estado: "subido" };
}

/**
 * Marca un pedido como preparado o entregado (o lo cobra), ande o no la señal.
 * Mismo camino que los pedidos: primero se anota en el celular y después se
 * intenta subir, así el vendedor nunca pierde lo que marcó en la calle.
 */
export async function registrarCambioEstado(
  cambio: CambioEstadoPendiente
): Promise<ResultadoCarga> {
  // La cola guarda un solo cambio por pedido: el último pisa al anterior, y
  // casi siempre está bien (marcarlo preparado y después entregado manda solo
  // "entregado"). La excepción es cobrar. Sin señal, "Entregado — a cuenta
  // corriente" y enseguida "Marcar como cobrado" dejaban solo el cobro: al
  // subir, el servidor rechazaba cobrar un pedido que para él nunca se había
  // entregado, y la entrega se perdía. Ahora el cobro se lleva la entrega
  // pendiente adentro y sube las dos cosas en orden.
  if (cambio.cobrar) {
    const previo = (await leerColaEstados()).find(
      (c) => c.pedidoId === cambio.pedidoId && !c.cobrar
    );
    if (previo) {
      cambio = {
        pedidoId: cambio.pedidoId,
        estado: previo.estado,
        formaPago: previo.formaPago,
        cobrar: true,
        tambienEstado: true,
      };
    }
  }
  await encolarEstado({ ...cambio, vendedorId: (await usuarioDeLaSesion()) ?? undefined });
  const { errores } = await sincronizar();

  const propio = errores.get(cambio.pedidoId);
  if (propio) {
    // Mismo criterio: la pantalla ya dice que no se guardó y no cambia el
    // estado, así que dejarlo en la cola sería un cambio que el repartidor
    // cree descartado y que igual seguiría intentando subir.
    await quitarEstadoDeCola(cambio.pedidoId);
    return { estado: "rechazado", motivo: propio };
  }

  const sigueEnCola = (await leerColaEstados()).some((c) => c.pedidoId === cambio.pedidoId);
  return sigueEnCola ? { estado: "en-cola" } : { estado: "subido" };
}

export interface ResultadoSincronizacion {
  subidos: number;
  pendientes: number;
  /** Motivo del rechazo, por visitaId o pedidoId, de lo que no pudo subir en esta pasada. */
  errores: Map<string, string>;
}

export async function sincronizar(): Promise<ResultadoSincronizacion> {
  const errores = new Map<string, string>();
  const usuarioId = await usuarioDeLaSesion();
  const duenio = await leerDuenio();

  // Solo lo de quien tiene la sesión abierta. Lo de otro repartidor que usó
  // este celular espera a que él entre: subirlo con esta sesión lo anotaría a
  // nombre del que está ahora.
  const propio = <T extends { vendedorId?: string }>(lista: T[]) =>
    usuarioId ? lista.filter((p) => esDe(p, usuarioId, duenio)) : [];
  const cola = propio(await leerCola());
  const colaEstados = propio(await leerColaEstados());

  if (cola.length === 0 && colaEstados.length === 0) {
    return { subidos: 0, pendientes: 0, errores };
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { subidos: 0, pendientes: cola.length + colaEstados.length, errores };
  }

  const supabase = crearClienteNavegador();
  let subidos = 0;
  // Con la primera falla de conexión se para: insistir con el resto de la
  // cola contra un servidor que no contesta solo demora, y lo que no subió
  // queda tal cual para la próxima pasada.
  let sinConexion = false;

  for (const pendiente of cola) {
    const { error, status } = await supabase.rpc("sincronizar_pedido", {
      p_visita_id: pendiente.visitaId,
      p_comercio_id: pendiente.comercioId,
      p_fecha_hora: pendiente.fechaHora,
      p_pedido_id: pendiente.pedidoId,
      p_items: pendiente.items,
      p_sin_qr_motivo: pendiente.sinQrMotivo ?? null,
    });

    if (!error) {
      await quitarDeCola(pendiente.visitaId);
      subidos += 1;
      continue;
    }

    if (esFallaPasajera(status)) {
      sinConexion = true;
      break;
    }

    // Un rechazo del servidor (comercio dado de baja, producto que ya no
    // existe, fecha vencida) no se arregla reintentando: se anota el motivo
    // y se deja en la cola para que el vendedor lo vea y avise.
    errores.set(pendiente.visitaId, enCastellano(error.message));
    await encolar({ ...pendiente, error: enCastellano(error.message) });
  }

  // Los estados van DESPUÉS de los pedidos, a propósito: si el vendedor cargó
  // un pedido y lo entregó todo sin señal, el pedido tiene que existir en la
  // base antes de que se le pueda cambiar el estado. Si aun así el pedido no
  // llegó a subir, el cambio queda en la cola y entra en la próxima pasada.
  const subirEstado = (cambio: CambioEstadoPendiente) =>
    supabase.rpc("cambiar_estado_pedido", {
      p_pedido_id: cambio.pedidoId,
      p_estado: cambio.estado,
      p_forma_pago: cambio.formaPago,
    });

  for (const cambio of sinConexion ? [] : colaEstados) {
    // Entrega a cuenta + cobro que se marcaron juntos sin señal: primero la
    // entrega, porque el servidor no cobra un pedido que no quedó a cuenta.
    // Si la entrega sube y el cobro no, el registro queda entero en la cola y
    // el reintento vuelve a mandar las dos: entregar de nuevo un pedido ya
    // entregado da lo mismo.
    const previo = cambio.cobrar && cambio.tambienEstado ? await subirEstado(cambio) : null;
    const { error, status } =
      previo && previo.error
        ? previo
        : cambio.cobrar
          ? await supabase.rpc("marcar_cobrado", { p_pedido_id: cambio.pedidoId })
          : await subirEstado(cambio);

    if (!error) {
      await quitarEstadoDeCola(cambio.pedidoId);
      subidos += 1;
      continue;
    }

    if (esFallaPasajera(status)) break;

    errores.set(cambio.pedidoId, enCastellano(error.message));
    await encolarEstado({ ...cambio, error: enCastellano(error.message) });
  }

  const pendientes = propio(await leerCola()).length + propio(await leerColaEstados()).length;
  return { subidos, pendientes, errores };
}

/** Refresca el catálogo guardado en el celular. Silencioso si no hay señal. */
export async function refrescarCatalogo(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const supabase = crearClienteNavegador();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: comercios }, { data: productos }, { data: perfil }, { data: pedidos }] =
    await Promise.all([
      supabase
        .from("comercios")
        .select("id, codigo, nombre, localidad, direccion, zona, lat")
        .eq("activo", true)
        .order("codigo"),
      supabase.from("productos").select("id, nombre, precio, unidad_medida").eq("activo", true).order("nombre"),
      user
        ? supabase.from("usuarios").select("nombre").eq("id", user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      // Los últimos pedidos, para poder repetirlos sin señal. Se traen los más
      // recientes y se guarda uno por comercio: alcanza para que cada comercio
      // de la cartera tenga el suyo sin bajarse el historial entero.
      user
        ? supabase
            .from("pedidos")
            .select(
              // total, forma_pago y cobrado_en son para la deuda del comercio:
              // viajan en el mismo viaje que ya se hacía, sin una consulta más.
              "comercio_id, fecha, total, forma_pago, cobrado_en, pedido_items(producto_id, cantidad)"
            )
            .eq("vendedor_id", user.id)
            .order("fecha", { ascending: false })
            .limit(300)
        : Promise.resolve({ data: null }),
    ]);

  if (comercios && productos) {
    // lat llega como string ("-40.796900"): numeric siempre viaja así por
    // PostgREST, para no perder precisión. Se normaliza acá, al guardar, en
    // vez de que cada pantalla se acuerde — el tipo ComercioLocal dice
    // number | null y tiene que ser cierto.
    //
    // lng no se baja a propósito: acá solo hace falta saber si el comercio ya
    // está en el mapa, y la base garantiza que lat y lng están las dos o
    // ninguna, así que lat sola alcanza. El mapa se dibuja en el panel.
    const normalizados = ordenarPorCodigo(comercios).map((comercio) => ({
      ...comercio,
      lat: numeroDeLaBase(comercio.lat),
    }));
    // CP2 antes que CP10: el vendedor busca por código en la lista.
    await guardarCatalogo(normalizados, productos);
  }
  if (perfil?.nombre) {
    await guardarPerfil(perfil.nombre);
  }

  if (pedidos) {
    // Vienen ordenados del más nuevo al más viejo: el primero de cada comercio
    // es el último que se le cargó.
    const porComercio: Record<string, { producto_id: string; cantidad: number }[]> = {};
    for (const pedido of pedidos) {
      const items = pedido.pedido_items ?? [];
      if (porComercio[pedido.comercio_id] || items.length === 0) continue;
      porComercio[pedido.comercio_id] = items.map((item) => ({
        producto_id: item.producto_id,
        // numeric llega como string (ver docs/PLAN.md sección 10).
        cantidad: Number(item.cantidad),
      }));
    }
    await guardarUltimosPedidos(porComercio);

    // Lo que cada comercio quedó debiendo: entregado a cuenta y sin cobrar.
    // Se calcula acá, al guardar, y no en cada pantalla: así el celular lo
    // tiene listo y anda igual sin señal.
    const deudas: Record<string, DeudaLocal> = {};
    for (const pedido of pedidos) {
      if (pedido.forma_pago !== "cuenta_corriente" || pedido.cobrado_en !== null) continue;
      const actual = deudas[pedido.comercio_id] ?? { pesos: 0, pedidos: 0, desde: pedido.fecha };
      actual.pesos += Number(pedido.total);
      actual.pedidos += 1;
      // Vienen del más nuevo al más viejo, así que el último que entra es el
      // más viejo: es el que dice hace cuánto que viene debiendo.
      actual.desde = pedido.fecha;
      deudas[pedido.comercio_id] = actual;
    }
    await guardarDeudas(deudas);
  }
}

/**
 * Saca de la cola un pedido que el servidor rechazó en segundo plano (por
 * ejemplo, porque dieron de baja el comercio mientras estaba guardado sin
 * señal). Sin esto no había forma de sacarlo: quedaba reintentando y fallando
 * para siempre, con el aviso de "1 sin subir" fijo arriba.
 *
 * Solo para lo rechazado: lo que espera señal no se toca, que se sube solo.
 */
export async function descartarRechazado(visitaId: string): Promise<void> {
  const pendiente = (await leerCola()).find((p) => p.visitaId === visitaId);
  if (pendiente?.error) await quitarDeCola(visitaId);
}
