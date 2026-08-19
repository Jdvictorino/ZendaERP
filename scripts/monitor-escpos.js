#!/usr/bin/env node

/**
 * Security Monitor for escpos Package
 * Monitorea actualizaciones y vulnerabilidades en escpos
 * 
 * Uso:
 * node scripts/monitor-escpos.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Colores para la salida
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function getInstalledVersion(packageName) {
  try {
    const packageJson = require(path.join(
      process.cwd(),
      'node_modules',
      packageName,
      'package.json'
    ));
    return packageJson.version;
  } catch (error) {
    return null;
  }
}

function getLatestVersion(packageName) {
  try {
    const output = execSync(`npm view ${packageName} version`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return output;
  } catch (error) {
    return null;
  }
}

function checkVulnerabilities() {
  try {
    log('\n🔍 Ejecutando audit de seguridad...', 'cyan');
    const output = execSync('pnpm audit --json', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    
    const auditData = JSON.parse(output);
    const escposVulns = [];

    if (auditData.vulnerabilities) {
      for (const [vulnName, vulnData] of Object.entries(auditData.vulnerabilities)) {
        if (vulnData.via && Array.isArray(vulnData.via)) {
          vulnData.via.forEach(via => {
            if (via.includes('escpos') || vulnData.nodes?.some(node => node.includes('escpos'))) {
              escposVulns.push({
                name: vulnName,
                severity: vulnData.severity,
                from: vulnData.from,
              });
            }
          });
        }
      }
    }

    return escposVulns;
  } catch (error) {
    return [];
  }
}

function generateReport() {
  const packageName = 'escpos';
  const installedVersion = getInstalledVersion(packageName);
  const latestVersion = getLatestVersion(packageName);
  const vulnerabilities = checkVulnerabilities();
  const timestamp = new Date().toISOString();

  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║           ESCPOS SECURITY MONITOR REPORT                   ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');

  log(`\n📅 Timestamp: ${timestamp}`, 'blue');

  log('\n📦 INFORMACIÓN DEL PAQUETE:', 'cyan');
  log(`   Nombre: ${packageName}`, 'reset');
  log(`   Versión Instalada: ${installedVersion || 'NO ENCONTRADA'}`, 'reset');
  log(`   Última Versión: ${latestVersion || 'NO DISPONIBLE'}`, 'reset');

  if (installedVersion && latestVersion) {
    const isOutdated = installedVersion !== latestVersion;
    if (isOutdated) {
      log(`   Estado: ⚠️  DESACTUALIZADO`, 'yellow');
    } else {
      log(`   Estado: ✅ ACTUALIZADO`, 'green');
    }
  }

  log('\n🔒 VULNERABILIDADES RELACIONADAS:', 'cyan');
  if (vulnerabilities.length === 0) {
    log('   ✅ Ninguna vulnerabilidad relacionada encontrada', 'green');
  } else {
    vulnerabilities.forEach((vuln, index) => {
      const severityColor = vuln.severity === 'critical' ? 'red' : 'yellow';
      log(`   ${index + 1}. ${vuln.name} [${vuln.severity.toUpperCase()}]`, severityColor);
    });
  }

  // Guardar reporte en archivo
  const reportPath = path.join(
    process.cwd(),
    '.escpos-monitor',
    `report-${Date.now()}.json`
  );

  const dir = path.dirname(reportPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const report = {
    timestamp,
    package: packageName,
    installedVersion,
    latestVersion,
    isOutdated: installedVersion !== latestVersion,
    vulnerabilities,
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  log(`\n📄 Reporte guardado en: .escpos-monitor/report-${Date.now()}.json`, 'blue');

  // Crear recomendaciones
  log('\n💡 RECOMENDACIONES:', 'cyan');
  if (installedVersion !== latestVersion) {
    log(`   1. Actualizar a versión ${latestVersion}:`, 'yellow');
    log(`      pnpm update escpos@${latestVersion}`, 'reset');
  } else {
    log('   1. ✅ Escpos está actualizado', 'green');
  }

  if (vulnerabilities.length > 0) {
    log('   2. Revisar SECURITY_AUDIT_REPORT.md para detalles', 'yellow');
    log('   3. Ejecutar pnpm audit para más información', 'reset');
  } else {
    log('   2. ✅ No hay vulnerabilidades relacionadas', 'green');
  }

  log('   3. Ejecutar este monitor regularmente (diario/semanal)', 'reset');

  return report;
}

function main() {
  try {
    generateReport();
    log('\n✅ Monitor completado exitosamente\n', 'green');
    process.exit(0);
  } catch (error) {
    log(`\n❌ Error durante monitoreo: ${error.message}\n`, 'red');
    process.exit(1);
  }
}

main();
