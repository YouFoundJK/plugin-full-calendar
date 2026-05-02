import fs from 'fs';

const metafile = JSON.parse(fs.readFileSync('metafile.json', 'utf8'));
const outputs = metafile.outputs;
const mainJs = Object.keys(outputs).find(key => key.endsWith('main.js'));

if (!mainJs) {
    console.error('Could not find main.js in metafile outputs');
    process.exit(1);
}

const inputs = outputs[mainJs].inputs;
const packageSizes = {};

for (const [file, data] of Object.entries(inputs)) {
    let packageName = 'source';
    if (file.includes('node_modules')) {
        const parts = file.split('node_modules/');
        const packagePart = parts[parts.length - 1];
        if (packagePart.startsWith('@')) {
            packageName = packagePart.split('/').slice(0, 2).join('/');
        } else {
            packageName = packagePart.split('/')[0];
        }
    }
    
    packageSizes[packageName] = (packageSizes[packageName] || 0) + data.bytesInOutput;
}

const sortedPackages = Object.entries(packageSizes)
    .sort((a, b) => b[1] - a[1]);

console.log('Top 20 contributors to bundle size:');
console.log('-----------------------------------');
sortedPackages.slice(0, 20).forEach(([name, size]) => {
    console.log(`${(size / 1024).toFixed(2).padStart(10)} KB  ${name}`);
});

const totalSize = Object.values(packageSizes).reduce((a, b) => a + b, 0);
console.log('-----------------------------------');
console.log(`${(totalSize / 1024).toFixed(2).padStart(10)} KB  TOTAL`);
