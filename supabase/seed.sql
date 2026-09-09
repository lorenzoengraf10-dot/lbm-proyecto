-- Datos de prueba para desarrollo. Los comercios/productos son ilustrativos:
-- reemplazar los comercios por la importación real (scripts/import-comercios.ts)
-- una vez que esté disponible el CSV/JSON definitivo.
-- Los usuarios (admin + vendedores) se siembran aparte con scripts/seed-usuarios.ts,
-- porque requieren el Admin API de Supabase Auth, no un simple insert SQL.

-- Unos pocos para desarrollo. La cartera real se carga importando
-- scripts/comercios-cp.csv (CP1 a CP100) desde el panel.
insert into public.comercios (codigo, nombre, localidad) values
  ('CP1', 'Almacén Don José', 'Carmen de Patagones'),
  ('CP2', 'Autoservicio La Esquina', 'Carmen de Patagones'),
  ('CP3', 'Despensa Rivadavia', 'Carmen de Patagones'),
  ('CP4', 'Almacén Belgrano', 'Carmen de Patagones'),
  ('CP5', 'Fiambrería El Sur', 'Carmen de Patagones');

insert into public.productos (nombre, precio, unidad_medida) values
  ('Jamón cocido', 4500.00, 'kg'),
  ('Salame picado grueso', 6200.00, 'kg'),
  ('Queso cremoso', 5300.00, 'kg'),
  ('Queso de rallar', 7800.00, 'kg'),
  ('Mortadela', 3900.00, 'kg'),
  ('Bondiola ahumada', 6800.00, 'kg'),
  ('Panceta ahumada', 5900.00, 'kg'),
  ('Salchichón', 4700.00, 'kg'),
  ('Chorizo seco', 6100.00, 'kg'),
  ('Matambre a la pizza', 7200.00, 'kg'),
  ('Queso provolone', 6600.00, 'kg'),
  ('Jamón crudo', 9800.00, 'kg'),
  ('Lomo ahumado', 8900.00, 'kg'),
  ('Queso port salut', 5100.00, 'kg'),
  ('Salame tipo milán', 6400.00, 'kg'),
  ('Aceitunas verdes', 3200.00, 'kg'),
  ('Escabeche de vegetales', 3600.00, 'kg'),
  ('Pate de campaña', 4100.00, 'unidad');
