/**
 * Generate multi-resolution Windows ICO and PNG icons from public/icon.svg
 * Required sizes for Windows: 16, 24, 32, 48, 64, 128, 256
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'public', 'icon.svg');
const buildDir = path.join(root, 'build');

// Ensure build dir exists
fs.mkdirSync(buildDir, { recursive: true });

// All sizes Windows expects in an ICO
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const pngPaths = [];

// Generate PNGs for each size
for (const size of icoSizes) {
  const outPath = path.join(buildDir, `icon-${size}.png`);
  console.log(`  Generating ${size}x${size} PNG...`);
  execSync(`npx -y sharp-cli -i "${svgPath}" -o "${outPath}" resize ${size} ${size}`, {
    cwd: root,
    stdio: 'pipe'
  });
  pngPaths.push(outPath);
}

// Also generate 512px for macOS/Linux
const icon512 = path.join(buildDir, 'icon-512.png');
console.log(`  Generating 512x512 PNG...`);
execSync(`npx -y sharp-cli -i "${svgPath}" -o "${icon512}" resize 512 512`, {
  cwd: root,
  stdio: 'pipe'
});

// Copy 256 as the main icon.png (for macOS/Linux fallback)
fs.copyFileSync(path.join(buildDir, 'icon-256.png'), path.join(buildDir, 'icon.png'));

// Build multi-resolution ICO from all PNG sizes
console.log('  Building multi-resolution icon.ico...');
const icoPath = path.join(buildDir, 'icon.ico');

// Use png-to-ico with all sizes
const pngArgs = pngPaths.map(p => `"${p}"`).join(' ');
try {
  execSync(`npx -y png-to-ico ${pngArgs} > "${icoPath}"`, {
    cwd: root,
    stdio: 'pipe',
    shell: true
  });
  
  const icoSize = fs.statSync(icoPath).size;
  console.log(`  ✓ icon.ico generated (${(icoSize / 1024).toFixed(1)} KB, ${icoSizes.length} sizes)`);
} catch (e) {
  console.error('  ✗ png-to-ico failed:', e.message);
  process.exit(1);
}

// Clean up intermediate PNGs (keep 256 and 512)
for (const size of [16, 24, 32, 48, 64, 128]) {
  const f = path.join(buildDir, `icon-${size}.png`);
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

console.log('\n✅ Icons ready:');
console.log('   build/icon.ico    → Windows (multi-res: 16-256px)');
console.log('   build/icon.png    → Electron BrowserWindow');
console.log('   build/icon-256.png → 256x256');
console.log('   build/icon-512.png → 512x512 (macOS/Linux)');
