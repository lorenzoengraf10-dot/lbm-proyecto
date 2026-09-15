-- Dónde queda cada comercio, y en qué zona del pueblo.
--
-- El teléfono resultó no servir: de 53 comercios cargados solo 14 lo tenían, y
-- para el reparto no hace falta llamar sino saber llegar. Lo que sí sirve es la
-- dirección (para leerla en la planilla impresa) y el punto exacto en el mapa
-- (para armar el recorrido y ver cómo se reparte la cartera por el pueblo).
--
-- La columna telefono NO se borra: los 14 que están cargados son datos reales
-- que alguien tomó, y borrarlos no se puede deshacer. Simplemente sale de las
-- pantallas. Si algún día vuelve a hacer falta, el dato sigue ahí.

alter table public.comercios
  -- Escrita a mano, como salga: "Mitre 340", "Rivadavia y 7 de Marzo",
  -- "frente a la escuela 12". Muchas despensas de barrio no tienen altura
  -- clara, así que exigir un formato sería pedirle al dueño que invente uno.
  add column direccion text,
  -- La zona la nombra el dueño, no un algoritmo: él sabe qué es "el centro" y
  -- qué es "la loma" mejor que cualquier agrupamiento automático, y así puede
  -- cambiarla cuando cambia el recorrido.
  add column zona text,
  -- El punto en el mapa. Lo toma el repartidor con el GPS del celular parado
  -- en la puerta del comercio (ver guardar_ubicacion_comercio más abajo).
  add column lat numeric(9, 6),
  add column lng numeric(9, 6),
  add column ubicacion_tomada_en timestamptz;

-- Los dos o ninguno: media coordenada no se puede dibujar en ningún lado, y
-- dejarla a medias haría que el mapa tuviera que desconfiar de cada punto.
alter table public.comercios
  add constraint comercios_ubicacion_completa
  check ((lat is null) = (lng is null)),
  -- Un GPS que devuelve basura, o un dedo en el teclado, no tiene que poder
  -- mandar un comercio al medio del océano Índico.
  add constraint comercios_ubicacion_en_el_planeta
  check (
    lat is null
    or (lat between -90 and 90 and lng between -180 and 180)
  ),
  -- Sin espacios al borde y sin cadena vacía, igual que la abreviatura del
  -- producto: "" y null querrían decir lo mismo y conviene una sola forma.
  add constraint comercios_direccion_razonable
  check (
    direccion is null
    or (btrim(direccion) = direccion and char_length(direccion) between 1 and 120)
  ),
  add constraint comercios_zona_razonable
  check (
    zona is null
    or (btrim(zona) = zona and char_length(zona) between 1 and 40)
  );

-- Para el mapa y para los filtros por zona.
create index idx_comercios_zona on public.comercios (zona) where zona is not null;
create index idx_comercios_con_ubicacion on public.comercios (lat, lng) where lat is not null;

-- La localidad venía escrita de cuatro formas distintas ("carmen de patagones",
-- "Carmen de patagones", "Carmen de Patagones" y un "Carmwn de patagones" con
-- typo), lo que hacía que agrupar por localidad diera cuatro grupos de un
-- mismo pueblo. Se unifican; no se toca ninguna otra localidad.
update public.comercios
set localidad = 'Carmen de Patagones'
where localidad <> 'Carmen de Patagones'
  and lower(localidad) similar to '%carm(e|w)n de patagones%';

/**
 * El repartidor guarda el punto del comercio donde está parado.
 *
 * security definer porque las RLS de comercios solo dejan escribir al admin, y
 * está bien que sea así: el repartidor no tiene por qué poder cambiarle el
 * nombre, el código ni darlo de baja. Esta función es la excepción acotada —
 * toca exactamente tres columnas y ninguna más.
 *
 * Los controles que las RLS ya no pueden hacer los hace ella:
 *   * exige rol vendedor activo,
 *   * exige que el comercio exista y esté activo,
 *   * valida que las coordenadas sean coordenadas.
 *
 * Pisa la ubicación anterior a propósito: si el comercio se mudó, o si la
 * primera lectura del GPS salió con poca precisión, el repartidor vuelve a
 * tocar el botón al pasar y queda la buena. Quién y cuándo no se guardan
 * aparte porque la marca de tiempo alcanza para saber si está fresca.
 */
create or replace function public.guardar_ubicacion_comercio(
  p_comercio_id uuid,
  p_lat numeric,
  p_lng numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if privado.rol_actual() is distinct from 'vendedor' then
    raise exception 'Solo un vendedor activo puede guardar la ubicación de un comercio';
  end if;

  if p_lat is null or p_lng is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180 then
    raise exception 'Coordenadas inválidas';
  end if;

  update public.comercios
  set lat = p_lat,
      lng = p_lng,
      ubicacion_tomada_en = now()
  where id = p_comercio_id and activo;

  if not found then
    raise exception 'El comercio no existe o está dado de baja';
  end if;
end;
$$;

-- Igual que el resto de las funciones del proyecto: nadie la ejecuta con el
-- rol anónimo, solo un usuario con sesión.
revoke execute on function public.guardar_ubicacion_comercio(uuid, numeric, numeric) from public, anon;
grant execute on function public.guardar_ubicacion_comercio(uuid, numeric, numeric) to authenticated, service_role;
