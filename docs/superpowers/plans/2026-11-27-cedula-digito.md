# Dígito verificador de la cédula — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Avisar, sin bloquear, cuando una cédula no pasa el dígito verificador en las fichas de cliente y de suplidor.

**Architecture:** La función pura `cedulaValid` va en `supplierId.js`, que tiene copia idéntica en la app y en el servidor. CustomerModal y SupplierModal muestran un aviso ámbar y no bloquean el guardado.

**Tech Stack:** React 19 + Vite, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-27-cedula-digito-design.md`

## Global Constraints
- Todo texto visible va en español.
- El aviso exacto es: "La cédula no pasa el dígito verificador; revísala."
- `src/utils/supplierId.js` y `backend/src/services/supplierId.js` deben quedar idénticos desde la línea 2, con su prueba de comparación (búscala; si no existe, agrégala como la de `test/paymentTerms.spec.js:87`).
- El servidor no rechaza nada nuevo.
- Las pruebas se corren por archivo: `NODE_OPTIONS=--localstorage-file=$TEMP/ls.json npx vitest run <archivo>`. Build: `npx -y node@22 node_modules/vite/bin/vite.js build`.

## Review Focus
1. Una cédula con guiones (`001-1391820-5`) se valida con sus dígitos. → Tarea 1.
2. Una cédula real que falla la regla igual se puede guardar. → Tarea 1, prueba de guardado con aviso.
3. Un RNC de 9 dígitos no muestra el aviso de cédula. → Tarea 1.

---

### Task 1: `cedulaValid` y avisos en las fichas

**Files:**
- Modify: `src/utils/supplierId.js` y `backend/src/services/supplierId.js` (exportan `cedulaValid` y `rncValid`; `normalizeSupplierId` devuelve `warning`)
- Modify: `src/components/modals/CustomerModal.jsx` (aviso; usa `rncValid` y `cedulaValid` compartidos en lugar de los locales)
- Modify: `src/components/modals/SupplierModal.jsx` (muestra `warning`)
- Test: `test/supplierId.spec.js` (extender), `test/customerModal.spec.jsx`, `test/supplierModal.spec.jsx`

- [ ] **Step 1: Pruebas.**
  - `cedulaValid`:
    - `'00113918205'` → true;
    - `'00113918204'` → false;
    - una cédula con un solo dígito cambiado → false;
    - entradas que no tienen 11 dígitos → false.
    
    Confirma los ejemplos con el algoritmo antes de fijarlos: pesos 1,2,1,2… sobre los primeros 10 dígitos; si un producto pasa de 9, se suman sus dígitos; el verificador es `(10 − suma%10)%10`.
  - `normalizeSupplierId`:
    - `('informal', '00113918204')` → `value '00113918204'`, `error null` y `warning` con el texto exacto;
    - `('persona_fisica', '00113918205')` → sin `warning`;
    - un RNC válido de persona física → sin `warning`.
  - CustomerModal:
    - con la cédula `001-1391820-4`, aparece el aviso y "Guardar" llama a `onSave` (no bloquea);
    - con `00113918205` no hay aviso;
    - un RNC válido no muestra el aviso.
  - SupplierModal: un suplidor informal con una cédula que falla muestra el aviso y se puede guardar.
  - Las copias de supplierId.js son idénticas.
- [ ] **Step 2:** Correr → debe fallar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Correr las pruebas → PASS. Correr también el build.
- [ ] **Step 5:** Commit `Cédula: aviso de dígito verificador en clientes y suplidores`.
