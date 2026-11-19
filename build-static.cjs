const { cpSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const output = join(__dirname, 'dist');
mkdirSync(output, { recursive: true });
cpSync(join(__dirname, '_headers'), join(output, '_headers'));

for (const path of ['assets', 'js']) {
    cpSync(join(__dirname, path), join(output, path), { recursive: true });
}

const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
writeFileSync(join(output, 'index.html'), html.replace(
    '<head>',
    '<head>\n    <meta name="farmwars-local-only" content="true">'
));
