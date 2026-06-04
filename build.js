const fs = require('fs');
const path = require('path');

const files = ['index.html', 'style.css', 'app.js', 'ncp.html', 'ncp.js', 'ncp.css'];
const destDir = path.join(__dirname, 'www');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir);
}

files.forEach(file => {
  const srcPath = path.join(__dirname, file);
  const destPath = path.join(destDir, file);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Successfully copied ${file} to www/`);
  } else {
    console.warn(`Warning: File ${file} not found!`);
  }
});
