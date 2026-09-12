-- Saber si a alguien ya se le cargó un PIN.
--
-- La contraseña que guarda Auth es opaca: desde la app no hay forma de
-- distinguir "puso mal el PIN" de "todavía no tiene ninguno". Sin esta marca,
-- un repartidor al que nadie le cargó el PIN ve "PIN incorrecto" y no entiende
-- por qué no entra, y el dueño tampoco ve a quién le falta.
--
-- No guarda el PIN ni nada que se le parezca: solo cuándo se lo fijaron.
alter table public.usuarios add column pin_fijado_en timestamptz;

-- Las cuentas que ya existen no tienen PIN todavía: entran recién cuando el
-- dueño se los cargue, y hasta entonces la pantalla se los dice.
