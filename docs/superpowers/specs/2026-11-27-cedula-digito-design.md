# Dígito verificador de la cédula — diseño corto

Proyecto 2 (fiscal y cobros), parte 5. Rama `fiscal-cedula`, sobre `main` bd44bb1. Aprobado por el dueño el 2026-11-27 (opción 1: avisar sin bloquear).

## Intención
Hoy la ficha del cliente y la del suplidor solo revisan que la cédula tenga 11 dígitos, así que una cédula mal escrita se guarda y luego sale en las facturas. El objetivo es atrapar los errores de digitación sin dejar fuera a ningún cliente real.

## Enfoques
1. **Avisar sin bloquear (elegido).** Si la cédula no pasa el dígito verificador, aparece un aviso, pero se puede guardar igual. El servidor no la rechaza. Así un cliente con una cédula vieja que no cumple el cálculo nunca queda fuera.
2. **Bloquear.** Descartado. Hay cédulas reales emitidas por la JCE que no cumplen el algoritmo, y no existe una lista oficial y actualizada de esas excepciones.

## Qué se construye
- **`cedulaValid(d)`.** Va en `supplierId.js`, en las copias de la app y del servidor, idénticas desde la línea 2, y se exporta junto con `rncValid`.
  - Recibe 11 dígitos y aplica el algoritmo de Luhn de la JCE: pesos 1, 2, 1, 2… sobre los primeros 10 dígitos.
  - Si un producto pasa de 9, se suman sus dos dígitos.
  - El dígito verificador es `(10 − suma % 10) % 10`.
- **Ficha del cliente (`CustomerModal`).**
  - Si la identificación tiene 11 dígitos y no pasa la regla, se muestra el aviso ámbar "La cédula no pasa el dígito verificador; revísala." debajo del campo, sin bloquear el guardado.
  - El `validateRNC` local se reemplaza por el `rncValid` compartido.
- **Ficha del suplidor (`normalizeSupplierId` / `SupplierModal`).**
  - `normalizeSupplierId` devuelve además `warning` cuando una cédula de 11 dígitos, de persona física o informal, no pasa la regla.
  - El modal muestra el mismo aviso ámbar sin bloquear.

## No metas
- Rechazar en el servidor.
- Tener una lista de excepciones.
- Validar el pasaporte.

## Decisiones del diseñador
- El aviso no exige confirmar: es solo texto.
- La validación de 11 dígitos que ya existe no cambia: menos de 11 dígitos sigue siendo error.
