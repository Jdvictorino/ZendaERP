# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Aplicación (existente): React 19 + Vite + Tailwind 3, empaquetada también con Electron; backend Express + Prisma + PostgreSQL.
Landing de www.zendaerp.online: HTML/CSS/JS estático sin dependencias, servido por nginx en zenda-server (decisión del dueño).

## Users

- **Primero:** emprendedores y comercios pequeños de República Dominicana que venden en mostrador y necesitan facturar con comprobante fiscal sin depender de un contador para cada operación.
- **También:** tiendas y comercios establecidos (punto de venta, caja, inventario), distribuidores (pedidos al por mayor, venta a crédito, cobros y rutas de entrega) y contadores que preparan los reportes DGII de sus clientes.

## Product Purpose

Zenda ERP reúne en un solo sistema la venta, la facturación fiscal dominicana (NCF y e-CF), el inventario, la caja, los cobros y la contabilidad, para que un negocio pequeño cumpla con la DGII y sepa cómo va su dinero sin juntar varias herramientas.

## Positioning

Hecho para República Dominicana desde el código: NCF B01/B02/B03/B04, comprobantes electrónicos e-CF (E31–E47) firmados y enviados a la DGII, ITBIS sobre precios inclusivos y formatos 606/607/608 generados desde las mismas ventas y compras. Un mismo sistema sirve al mostrador (modo Tienda) y a la venta mayorista a crédito con rutas de entrega (modo Distribuidor).

## Operating Context

- Se usa en mostrador (cajero con lector de códigos de barras, impresora térmica, gaveta de dinero) y en oficina (dueño, gerente, contador).
- Disponible como aplicación web y como app de escritorio para Windows que se actualiza sola.
- El celular sirve como lector de códigos de barras vinculándolo con un QR desde la caja.
- Roles: administrador, gerente, supervisor, cajero, repartidor, contador y consulta.

## Capabilities and Constraints

- Facturación: NCF tradicionales y e-CF; pedido → cobro → factura → anulación → notas de crédito/débito; pagos en efectivo, tarjeta, transferencia, mixtos, a crédito y abonos parciales; factura en PDF por correo.
- Inventario: stock en tiempo real, variantes con SKU y código de barras EAN-13, alertas de mínimo, historial de movimientos, importación desde Excel.
- Caja: apertura y cierre de turno, retiros y depósitos, diferencias de cuadre.
- Cuentas por cobrar y por pagar, gastos y compras (606).
- Contabilidad de doble entrada con asientos automáticos; diario, mayor, balanza de comprobación, balance ajustado y costo de ventas.
- Envíos con QR de rastreo y confirmación de entrega desde el móvil del repartidor.
- Multiempresa (SaaS) con estados de suscripción y panel de plataforma.
- Precio confirmado: un plan de RD$1,250 mensuales. Una versión de escritorio independiente de pago único está anunciada como "Próximamente", sin precio.
- Acción principal de la landing: solicitar una demostración. **Pendiente:** el canal (número de WhatsApp o correo) que debe recibir las solicitudes.

## Brand Commitments

- Nombre: Zenda ERP. Lema existente en el paquete: "El Mejor Amigo de Tus Finanzas."
- Tipografía Inter y marca índigo (fijadas por el dueño para la aplicación).
- Logo: `public/icon.svg`.

## Evidence on Hand

- Capturas reales de la aplicación (se pueden generar con datos de demostración).
- No hay testimonios, clientes publicables, cifras de uso, certificaciones ni prensa: no se deben inventar. Los e-CF están implementados pero el dueño aún no tiene el certificado .p12 para emitir en producción; no afirmar que está certificado por la DGII.

## Product Principles

1. Cumplir con la DGII es la base, no un extra: lo fiscal sale solo de la operación diaria.
2. Lo simple primero: un emprendedor debe poder vender y facturar el primer día.
3. Un solo lugar para el dinero del negocio: venta, caja, cobros, gastos y contabilidad conectados.
4. Honestidad comercial: solo se promete lo que el sistema ya hace.

## Accessibility & Inclusion

Público dominicano en español; muchos usuarios con poca experiencia en software contable. Lenguaje llano y contraste suficiente (WCAG AA) en la app y la landing.
