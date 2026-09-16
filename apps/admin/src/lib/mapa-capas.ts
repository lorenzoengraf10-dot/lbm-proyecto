import type * as Leaflet from "leaflet";

/**
 * Las capas de fondo de los dos mapas del panel.
 *
 * Está acá y no adentro de cada mapa porque son dos —el de la cartera y el de
 * elegir el punto de un comercio— y tienen que verse igual: si uno sale foto y
 * el otro dibujo, marcar la puerta en uno y buscarla en el otro es un lío.
 *
 * Recibe el Leaflet ya cargado en vez de importarlo: Leaflet toca window al
 * importarse y en el prerender del servidor eso revienta, así que se carga
 * adentro de un efecto y se pasa para acá.
 */

/**
 * Cuánto se espera antes de decir que no cargó nada.
 *
 * No alcanza con contar fallas: en los bordes del mapa siempre hay algún
 * azulejo que no existe, y avisar por eso sería crearle un problema donde no
 * lo hay. Lo que importa es el caso feo —que no haya entrado ninguno— así que
 * se mira si hubo aunque sea uno bueno.
 */
const ESPERA_ANTES_DE_AVISAR_MS = 6000;

export interface CapasDelMapa {
  /** La que arranca puesta. Hay que agregarla al mapa. */
  inicial: Leaflet.TileLayer;
  /** El selector de arriba a la derecha para cambiar de una a otra. */
  control: Leaflet.Control.Layers;
}

export function armarCapas(
  L: typeof Leaflet,
  /** Se llama cuando varios azulejos no cargaron, para poder decirlo en pantalla. */
  alFallar: () => void
): CapasDelMapa {
  let entroAlguno = false;
  let reloj: ReturnType<typeof setTimeout> | null = null;

  const revisar = () => {
    if (reloj !== null) return;
    reloj = setTimeout(() => {
      if (!entroAlguno) alFallar();
    }, ESPERA_ANTES_DE_AVISAR_MS);
  };
  const contarBueno = () => {
    entroAlguno = true;
  };

  // Foto satelital. Es la que pidió el dueño y para esto es la buena: un
  // comercio de barrio se reconoce por el techo y la vereda, no por el nombre
  // de la calle. La atribución es obligatoria por las condiciones de Esri.
  const satelite = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution: "Imágenes &copy; Esri y colaboradores",
    }
  );

  // El dibujo de siempre, con los nombres de las calles. La foto no los trae,
  // así que para leer una dirección hay que poder cambiar.
  //
  // La atribución es obligatoria por las condiciones de uso de OpenStreetMap,
  // así que no se saca.
  const calles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });

  // Los azulejos son lo único que sale a internet. Nunca viaja qué comercios
  // hay ni qué pidieron: el servidor de mapas solo ve qué pedazo del mundo se
  // está mirando.
  for (const capa of [satelite, calles]) {
    capa.on("tileerror", revisar);
    capa.on("tileload", contarBueno);
    // Cambiar de fondo vuelve a intentar: el que estaba bloqueado puede no
    // serlo, así que el aviso se recalcula con la capa nueva.
    capa.on("add", () => {
      entroAlguno = false;
      if (reloj !== null) {
        clearTimeout(reloj);
        reloj = null;
      }
      revisar();
    });
  }

  return {
    inicial: satelite,
    control: L.control.layers(
      { Satélite: satelite, Calles: calles },
      {},
      { position: "topright" }
    ),
  };
}

/** Lo que se muestra cuando los azulejos no llegan, en vez de un cuadro gris. */
export const AVISO_SIN_AZULEJOS =
  "No cargó ninguna imagen del mapa, así que el fondo queda gris. Los puntos están bien igual. " +
  "Probá cambiar el fondo con el selector de arriba a la derecha —si uno está bloqueado, el otro " +
  "puede andar— y si siguen los dos en gris suele ser la conexión o un bloqueador de publicidad " +
  "del navegador.";
