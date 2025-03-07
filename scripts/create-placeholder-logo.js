const fs = require('fs');
const path = require('path');

// Create a simple SVG logo as a placeholder
const size = 200;
const svgLogo = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 10}" fill="#6E56CF" />
  <text x="${size/2}" y="${size/2 + 10}" font-family="Arial" font-size="60" font-weight="bold" text-anchor="middle" fill="white">JR</text>
</svg>`;

// Ensure the assets directory exists
const assetsDir = path.join(__dirname, '..', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Write the SVG file
const logoPath = path.join(assetsDir, 'logo.svg');
fs.writeFileSync(logoPath, svgLogo);

console.log(`Placeholder logo created at: ${logoPath}`);
console.log('You can replace this with your actual logo image.'); 