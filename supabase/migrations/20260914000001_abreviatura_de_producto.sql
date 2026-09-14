-- La abreviatura del producto, elegida por el dueño al cargarlo.
--
-- Es lo que se imprime en la planilla del día: "Queso rallado sachet" no entra
-- en una celda de una hoja A4, y quién mejor que el dueño para decidir cómo se
-- llama corto en su negocio. Queda opcional: si no se carga, la planilla
-- acorta el nombre sola (apps/admin/src/lib/abreviar.ts).
alter table public.productos add column abreviatura text;

-- Sin espacios al borde y sin cadena vacía: "" y null querrían decir lo mismo
-- (usar el nombre acortado automáticamente) y conviene que haya una sola forma
-- de escribirlo. Hasta 20 caracteres, que es lo que entra en la planilla.
alter table public.productos
  add constraint productos_abreviatura_razonable
  check (
    abreviatura is null
    or (btrim(abreviatura) = abreviatura and char_length(abreviatura) between 1 and 20)
  );

-- Única, como el nombre: dos productos con la misma abreviatura harían una
-- planilla donde no se sabe cuál es cuál, que es justo lo que la abreviatura
-- tiene que evitar.
create unique index idx_productos_abreviatura_lower
  on public.productos (lower(abreviatura))
  where abreviatura is not null;
