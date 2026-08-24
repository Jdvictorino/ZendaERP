/**
 * Generate app icons from public/icon.svg
 * Creates all required sizes for Windows (.ico), macOS (.icns), and Linux (.png)
 * 
 * Required sizes:
 *   Windows ICO: 16, 24, 32, 48, 64, 128, 256 (embedded in single .ico)
 *   macOS ICNS:  16, 32, 64, 128, 256, 512, 1024 (electron-builder converts from 512/1024 PNG)
 *   Linux:       16, 32, 48, 128, 256, 512
 *   Electron BrowserWindow: 256+ (we use 512 for HiDPI)
 *   PWA:         192, 512 (already handled via SVG in manifest)
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const svgPath = join(root, 'public', 'icon.svg');
const buildDir = join(root, 'build');

// Ensure build dir exists
mkdirSync(buildDir, { recursive: true });

// All sizes needed across platforms (deduplicated, sorted)
const allSizes = [16, 24, 32, 48, 64, 128, 192, 256, 512, 1024];

// Sizes that go into the Windows ICO file
const icoSizes = [16, 24, 32, 48, 64, 128, 256];

console.log('🎨 Generating icons from SVG source...\n');

// --- Step 1: Generate PNGs at all required sizes using sharp ---
const pngPaths = {};

for (const size of allSizes) {
  const outPath = join(buildDir, `icon-${size}.png`);
  console.log(`  📐 ${size}x${size} PNG...`);
  execSync(
    `npx -y sharp-cli -i "${svgPath}" -o "${outPath}" resize ${size} ${size} --fit contain --background "transparent"`,
    { cwd: root, stdio: 'pipe' }
  );
  pngPaths[size] = outPath;
}

console.log(`\n  ✓ Generated ${allSizes.length} PNG sizes\n`);

// --- Step 2: Copy 512 as the main icon.png (for macOS, Linux, and Electron BrowserWindow) ---
const mainPng = join(buildDir, 'icon.png');
writeFileSync(mainPng, readFileSync(pngPaths[512]));
console.log('  📋 Copied icon-512.png → icon.png (main icon for macOS/Linux/Electron)\n');

// --- Step 3: Generate multi-resolution ICO for Windows ---
// The ICO file should contain multiple sizes so Windows can pick the right one
// for taskbar (16/24), title bar (32), Alt+Tab (48/64), and desktop shortcuts (128/256)
console.log('  🪟 Generating multi-resolution icon.ico for Windows...');

const icoPngs = icoSizes.map(s => `"${pngPaths[s]}"`).join(' ');
const icoOutPath = join(buildDir, 'icon.ico');

try {
  execSync(`npx -y png-to-ico ${icoPngs} > "${icoOutPath}"`, {
    cwd: root,
    stdio: 'pipe',
    shell: true
  });
  console.log(`  ✓ icon.ico generated with sizes: ${icoSizes.join(', ')}px\n`);
} catch (e) {
  console.warn('  ⚠ png-to-ico failed, trying alternative with to-ico...');
  try {
    // Alternative approach using to-ico package
    const toIco = (await import('to-ico')).default || (await import('to-ico'));
    const buffers = icoSizes.map(s => readFileSync(pngPaths[s]));
    const ico = await toIco(buffers);
    writeFileSync(icoOutPath, ico);
    console.log(`  ✓ icon.ico generated (alternative method) with sizes: ${icoSizes.join(', ')}px\n`);
  } catch (e2) {
    console.error('  ✗ ICO generation failed. Falling back to electron-builder PNG→ICO conversion.');
    console.error(`    Error: ${e2.message}\n`);
  }
}

// --- Step 4: Generate ICNS for macOS (if on macOS or using iconutil) ---
// electron-builder can auto-convert from a 512x512 or 1024x1024 PNG,
// but providing an .icns is more reliable.
// On macOS, we'd use iconutil; on other platforms, electron-builder handles it.
if (process.platform === 'darwin') {
  console.log('  🍎 Generating icon.icns for macOS...');
  const iconsetDir = join(buildDir, 'icon.iconset');
  mkdirSync(iconsetDir, { recursive: true });

  // macOS iconset naming convention
  const iconsetSizes = [
    { name: 'icon_16x16.png', size: 16 },
    { name: 'icon_16x16@2x.png', size: 32 },
    { name: 'icon_32x32.png', size: 32 },
    { name: 'icon_32x32@2x.png', size: 64 },
    { name: 'icon_128x128.png', size: 128 },
    { name: 'icon_128x128@2x.png', size: 256 },
    { name: 'icon_256x256.png', size: 256 },
    { name: 'icon_256x256@2x.png', size: 512 },
    { name: 'icon_512x512.png', size: 512 },
    { name: 'icon_512x512@2x.png', size: 1024 },
  ];

  for (const { name, size } of iconsetSizes) {
    writeFileSync(join(iconsetDir, name), readFileSync(pngPaths[size]));
  }

  try {
    execSync(`iconutil -c icns "${iconsetDir}" -o "${join(buildDir, 'icon.icns')}"`, {
      stdio: 'pipe'
    });
    console.log('  ✓ icon.icns generated\n');
  } catch (e) {
    console.warn('  ⚠ iconutil failed, electron-builder will auto-convert from PNG\n');
  }
} else {
  console.log('  ℹ Skipping .icns generation (not on macOS) — electron-builder will auto-convert from icon.png\n');
}

// --- Step 5: Generate PWA-ready PNGs ---
// The manifest currently uses SVG, but let's also provide raster fallbacks
const pwaSizes = [192, 512];
for (const size of pwaSizes) {
  const src = pngPaths[size];
  const dest = join(root, 'public', `icon-${size}.png`);
  writeFileSync(dest, readFileSync(src));
}
console.log('  📱 PWA raster fallback icons copied to public/\n');

// --- Summary ---
console.log('═══════════════════════════════════════════════════');
console.log('  ✅ Icon generation complete!');
console.log('═══════════════════════════════════════════════════');
console.log(`  📁 Build directory: ${buildDir}`);
console.log(`  🪟 Windows:  icon.ico (${icoSizes.join(', ')}px)`);
console.log(`  🍎 macOS:    icon.png (512px) — electron-builder auto-converts to ICNS`);
console.log(`  🐧 Linux:    icon.png (512px)`);
console.log(`  🖥️  Electron: icon.png (512px) for BrowserWindow`);
console.log(`  📱 PWA:      icon-192.png, icon-512.png in public/`);
console.log('═══════════════════════════════════════════════════\n');
