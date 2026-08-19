# 🔐 Sistema de Monitoreo de Seguridad - Zenda ERP

## ✨ Overview Rápido

Este proyecto incluye un **sistema automático de monitoreo de seguridad** que rastrea vulnerabilidades en el paquete `escpos` y sus dependencias.

```
🟢 Estado: OPERATIVO
🔄 Frecuencia: Diaria (9:00 AM UTC)
📊 Reportes: .escpos-monitor/
```

## 🚀 Uso Rápido

### **Ejecutar monitoreo ahora:**
```powershell
pnpm run monitor:escpos
```

### **Ver reportes de seguridad:**
```powershell
Get-ChildItem .escpos-monitor/
cat .escpos-monitor/report-*.json
```

### **Audit completo de dependencias:**
```powershell
pnpm audit --prod
```

## 📚 Documentación

- **[MONITORING_GUIDE.md](./MONITORING_GUIDE.md)** - Guía completa de uso del sistema
- **[MONITORING_IMPLEMENTATION_REPORT.md](./MONITORING_IMPLEMENTATION_REPORT.md)** - Detalles de implementación
- **[CVE-2025-55182_ANALYSIS.md](./CVE-2025-55182_ANALYSIS.md)** - Análisis de vulnerabilidad resuelta
- **[SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md)** - Reporte de audit actual

## 🤖 Automatización

GitHub Actions ejecuta automáticamente cada día:
- Verifica versión de escpos
- Escanea vulnerabilidades
- Comenta en PRs si hay updates
- Crea issues para problemas de seguridad

**Ver workflow:** `.github/workflows/security-monitor.yml`

## 📦 Componentes del Sistema

| Componente | Ubicación | Función |
|-----------|-----------|---------|
| Monitor Script | `scripts/monitor-escpos.js` | Detección local de vulnerabilidades |
| GitHub Actions | `.github/workflows/security-monitor.yml` | Automatización diaria |
| Reportes | `.escpos-monitor/` | Historial de análisis |
| Guía | `MONITORING_GUIDE.md` | Documentación de uso |

## 🎯 Qué Monitorea

✅ **Versión de escpos** - Detecta versiones más recientes  
✅ **Vulnerabilidades** - Escanea transitive dependencies  
✅ **Recomendaciones** - Sugiere acciones de corrección  
✅ **Reportes** - Genera JSON con timestamp  

## 🔧 Scripts Disponibles

```json
{
  "monitor:escpos": "node scripts/monitor-escpos.js",
  "audit": "pnpm audit --prod"
}
```

## 📋 Requisitos

- Node.js 22+
- pnpm 10.18+
- Git (para GitHub Actions)

## 🆘 Solución Rápida de Problemas

**P: ¿Cómo ejecuto el monitor?**  
R: `pnpm run monitor:escpos`

**P: ¿Dónde están los reportes?**  
R: En el directorio `.escpos-monitor/`

**P: ¿Con qué frecuencia se ejecuta?**  
R: Automáticamente cada día a las 9:00 AM UTC

**P: ¿Cómo agrego más paquetes?**  
R: Consulta `MONITORING_GUIDE.md` para configuración avanzada

## ✅ Estado de Verificación

```
✅ Sistema operativo
✅ Scripts probados
✅ GitHub Actions configurado
✅ Reportes generándose
✅ Documentación completa
```

## 🔗 Enlaces Rápidos

- [Documentación Técnica](./DOCUMENTACION_TECNICA.md)
- [Arquitectura del Proyecto](./src/ARQUITECTURA.md)
- [GitHub Repository](https://github.com/Jdvictorino/zenda-erp)

---

**Última actualización:** 7 de diciembre de 2025  
**Mantenedor:** GitHub Copilot  
**Versión:** 1.0
