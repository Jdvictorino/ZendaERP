# Factura DGII Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Identificación del cliente correcta y obligatoria según el tipo, factura con el formato de la DGII y cantidad sin repetir el empaque.

**Architecture:** Cambios locales en los generadores de documentos del cliente (`pdfGenerator.js`, `escposGenerator.js`, `docLines.js`), en `units.js` (dos copias) y en el alta de clientes (formulario + ruta). Sin migración.

**Tech Stack:** React 19, jsPDF + autoTable, Express + zod, Vitest.

**Spec:** docs/superpowers/specs/2026-11-24-factura-formato-dgii-design.md

## Global Constraints

- `src/utils/units.js` y `backend/src/services/units.js` se mantienen idénticas desde la línea 2.
- La abreviatura de `unidad` pasa a `ud.`.
- Tipos con identificación obligatoria: `empresa`, `gubernamental`, `zona_franca`, `regimen_especial`, `diplomatico`, `ong`. Opcional: `consumidor_final`, `persona_fisica`.
- Nunca imprimir `customerId` (uuid) como identificación.
- Pruebas con `npx vitest run <archivo>` por archivo (la corrida completa se cuelga).

## Review Focus

- Línea vieja sin `product` ni empaque: la cantidad sigue saliendo solo como número (`3`).
- Cliente con pasaporte (`AB123456`): se guarda tal cual en mayúsculas, sin perder las letras.
- Factura sin cliente (consumidor final): no imprime "RNC/Cédula", ni "N/A", ni el uuid.
- Editar un cliente existente con `rnc` guardado: el campo aparece lleno.
- Empresa con modo Tienda y `allowCustomization` sin definir: la columna Notas sigue apareciendo (por defecto está activo).

---

### Task 1: Cantidad y abreviatura

**Files:** Modify `src/utils/docLines.js`, `src/utils/units.js`, `backend/src/services/units.js`, `src/components/products/PackagingsEditor.jsx` (valor por defecto `'ud.'`). Test: `test/receiptAmounts.spec.js`, `test/units.spec.js`.

**Interfaces:** Produces `qtyText(item) -> string`: con `packagingName` → solo el número (`formatQty(q)` sin unidad); con `product.unit` → `formatQty(q, unitOf(unit).abbr)` (`"1.5 lb"`, `"3 ud."`); sin datos → número.

- [ ] Cambiar las pruebas: `'2 Caja de 24'` → `toContain('<td>2</td>')`; añadir `{ quantity: 3, product: { unit: 'unidad' } }` → `'3 ud.'`; `formatQty(2, 'ud.')` → `'2 ud.'`. Mantener "línea vieja muestra 3 solo".
- [ ] Correr y ver fallar; implementar; correr `test/receiptAmounts.spec.js test/units.spec.js test/packagingsEditor.spec.jsx` y ver pasar.
- [ ] Commit `Factura: la cantidad lleva solo la unidad base; el empaque va en la descripción`.

### Task 2: Identificación del cliente (formulario + servidor)

**Files:** Modify `src/components/modals/CustomerModal.jsx`, `backend/src/routes/customers.js`, `backend/src/services/customerTax.js`. Test: `test/customerModal.spec.jsx`, `test/customerTax.spec.js`.

**Interfaces:** Produces en `customerTax.js`: `ID_REQUIRED_TYPES` (los 6 tipos) y `normalizeCustomerId(value) -> string|null` (solo dígitos si no tiene letras; si tiene letras, mayúsculas sin espacios ni guiones; vacío → null). La ruta POST/PUT responde 400 `"La identificación (RNC) es obligatoria para este tipo de cliente."` si el tipo resultante lo exige y no hay `rnc` (en PUT cuenta el guardado).

- [ ] Pruebas: `normalizeCustomerId('001-1234567-8') === '00112345678'`, `('ab 123-456') === 'AB123456'`, `('') === null`; modal: empresa sin RNC no llama `onSave` y muestra error; persona con pasaporte `AB123456` envía `identificationNumber: 'AB123456'`; `customer={{ id: 'x', rnc: '131000001' }}` muestra el valor. Ajustar las dos pruebas existentes de zona franca/ONG para que lleven un RNC válido.
- [ ] Modal: cargar `customer.identificationNumber || customer.rnc`; personas aceptan cédula (máscara si solo dígitos) o pasaporte (6–20 alfanuméricos); tipos obligatorios marcan "Requerido".
- [ ] Ruta: usar `normalizeCustomerId` en vez de `replace(/\D/g, '')`; validar el obligatorio.
- [ ] Correr las dos pruebas; commit `Clientes: identificación obligatoria para empresas y pasaporte para personas`.

### Task 3: Formato DGII del PDF y del recibo

**Files:** Modify `src/utils/pdfGenerator.js`, `src/utils/escposGenerator.js`. Test: `test/receiptAmounts.spec.js` (recibo), nuevo `test/invoicePdf.spec.js` para helpers puros.

**Interfaces:** Exporta de `pdfGenerator.js`: `customerTaxId(customerDetails, docData) -> string|null` (`docData.customerRnc || customerDetails?.rnc || customerDetails?.identificationNumber || null`), `invoiceTitle(docData) -> string` (eNcf/ncf `E..` → nombre de `ECF_TYPES`; `B01` "Factura de Crédito Fiscal", `B02` "Factura de Consumo", `B14` "Factura de Régimen Especial", `B15` "Factura Gubernamental"; si no, "Factura"), `showNotesColumn(companyProfile) -> boolean` (falso si `orderMode`/`settings.orderMode` es `'distributor'` o `allowCustomization === false`).

- [ ] Pruebas de los tres helpers (incluye: sin rnc → null aunque haya `customerId`; Tienda sin `allowCustomization` → true) y del recibo: sin identificación no aparece `RNC/Ced`, nunca el `customerId`.
- [ ] PDF: título con `invoiceTitle`; tarjeta cliente con "RNC/Cédula" y "Nombre o razón social" (sin líneas N/A); "Atendido por" pequeño (8 pt) con nombre y "Empleado N.º"; tabla Cant. | Descripción (+ SKU debajo) | [Notas] | Precio | ITBIS (`round2(amount * taxRate / 100)`) | Valor; se mantienen datos bancarios y QR e-CF.
- [ ] Recibo: usar `customerTaxId`.
- [ ] Correr pruebas; generar un PDF real con la app local y mirarlo; commit `Factura con el formato de la DGII: título por comprobante, ITBIS por línea y sin columna Notas fuera de Personalizar`.
