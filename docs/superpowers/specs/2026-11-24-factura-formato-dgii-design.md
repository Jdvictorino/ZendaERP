# Factura: identificación del cliente, formato DGII y cantidad

Aprobado por el dueño el 2026-11-24. Va en la rama `distribuidor-base` (PR #52): el punto 3 depende de las unidades de ese PR.

## Por qué
Las facturas impresas muestran un código largo (el id interno del cliente) donde va la cédula/RNC, la columna Notas sale vacía en negocios que no personalizan, y la cantidad repite el empaque que ya dice la descripción. Pasa también en producción.

## Qué se hace
1. **Identificación del cliente**
   - El PDF y el recibo leen `docData.customerRnc` (copia guardada al facturar) o `customer.rnc`; nunca el id interno. Sin identificación, la línea no se imprime.
   - El formulario de cliente carga `rnc` al editar (hoy sale vacío).
   - Obligatoria (formulario y servidor) para persona física (cédula o RNC), empresa, gubernamental, zona franca, régimen especial, diplomático y ONG; opcional solo para consumidor final. La etiqueta pasa a "Persona Física".
   - Consumidor final: cédula de 11 dígitos o pasaporte (letras y números, 6 a 20). El servidor guarda la cédula/RNC solo con dígitos y el pasaporte en mayúsculas sin espacios ni guiones.
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

## Segunda parte: Representación Impresa del e-CF (Informe Técnico e-CF v1.0, sección 18) y ticket

Aprobado por el dueño el 2026-11-24.

- **Indicador "E"** a la izquierda de la descripción de cada artículo exento (tasa 0), en PDF y ticket.
- **Descuento por línea**: si alguna línea tiene descuento, el PDF agrega la columna "Desc." (monto) y el ticket lo muestra bajo la línea.
- **QR del PDF** a 20 mm o más del borde izquierdo de la hoja (mínimo DGII), tamaño 32 mm.
- **Notas de crédito y débito**: arriba a la derecha, "e-NCF modificado" y el código de modificación en palabras. Se toma del XML firmado (`CodigoModificacion`, `NCFModificado`); en papel, "Anula el NCF modificado" si la nota es "Anulación de Factura", si no "Corrige montos del NCF modificado".
- **Unidad en palabras solo en e-CF** (comprobante que empieza por E): "1.5 libras", "3 unidades". En lo demás sigue la abreviatura.
- **Ticket 80 mm**: título por comprobante, e-NCF, vencimiento y fecha; cliente solo si existe (consumo sin cliente lo omite); líneas CANT · [E] DESCRIPCIÓN · VALOR sin "RD$", con "precio c/u", ITBIS y descuento en la segunda línea; subtotal gravado, subtotal exento, descuento, ITBIS y TOTAL con "RD$"; pago y cambio; QR, código de seguridad y firma digital; "Atendido por" con nombre y número de empleado.
- **Fuera de alcance:** municipio y provincia del emisor (la dirección de la empresa no tiene esos campos) y paginación de facturas de varias páginas.
