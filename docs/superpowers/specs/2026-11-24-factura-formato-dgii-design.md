# Factura: identificación del cliente, formato DGII y cantidad

Aprobado por el dueño el 2026-11-24. Va en la rama `distribuidor-base` (PR #52): el punto 3 depende de las unidades de ese PR.

## Por qué
Las facturas impresas muestran un código largo (el id interno del cliente) donde va la cédula/RNC, la columna Notas sale vacía en negocios que no personalizan, y la cantidad repite el empaque que ya dice la descripción. Pasa también en producción.

## Qué se hace
1. **Identificación del cliente**
   - El PDF y el recibo leen `docData.customerRnc` (copia guardada al facturar) o `customer.rnc`; nunca el id interno. Sin identificación, la línea no se imprime.
   - El formulario de cliente carga `rnc` al editar (hoy sale vacío).
   - Obligatoria (formulario y servidor) para empresa, gubernamental, zona franca, régimen especial, diplomático y ONG; opcional para consumidor final y persona física.
   - Persona: cédula de 11 dígitos o pasaporte (letras y números, 6 a 20). El servidor guarda la cédula/RNC solo con dígitos y el pasaporte en mayúsculas sin espacios ni guiones.
2. **Formato DGII (Norma 06-2018, art. 7, y su modelo)**
   - Título según el comprobante: nombre del tipo e-CF (E31, E32…), "Factura de Crédito Fiscal" (B01), "Factura de Consumo" (B02), "Factura Gubernamental" (B15), "Factura de Régimen Especial" (B14); sin comprobante, "Factura".
   - Cliente: "RNC/Cédula" y "Nombre o razón social", más teléfono y dirección si existen; sin "N/A".
   - "Atendido por" más pequeño, a un lado: solo nombre y número de empleado.
   - Detalle: Cant. | Descripción (SKU debajo, letra pequeña) | Precio | ITBIS | Valor. La columna Notas solo en modo Tienda con "Personalizar" activo.
   - Se mantienen los datos bancarios ("Pago por transferencia") y el bloque del QR del e-CF.
3. **Cantidad**: número y unidad base ("1.5 lb", "3 ud."); en líneas de empaque solo el número, porque la descripción ya lo dice. La abreviatura de unidad pasa de "und" a "ud.".

## Enfoques considerados
- Arreglar solo el respaldo al id interno: rápido, pero deja la columna Notas, la cantidad y el título fuera de la norma. Descartado.
- Reescribir el PDF desde cero con otra librería: innecesario; jsPDF + autoTable ya cubren el modelo. Descartado.
- **Elegido:** ajustar `pdfGenerator.js`, `escposGenerator.js`, `docLines.qtyText`, `units.js` (ambas copias), `CustomerModal.jsx` y `routes/customers.js`.

## Fuera de alcance
- La marca "original: cliente / copia: vendedor" (para talonarios impresos).
- Sucursal y nombre comercial: la empresa no tiene esos datos hoy.
