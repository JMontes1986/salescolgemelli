-- Limpieza puntual del usuario de prueba: elimina compras de autogestión de esta cédula.
delete from public.purchases
where cedula = '1053769766'
  and id like 'PV%'
  and "sellerId" is null;