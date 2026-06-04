const fs = require('fs');
const t = fs.readFileSync('app/parent/dashboard/page.tsx', 'utf8');
let c = 0, b = 0, p = 0;
for (const ch of t) {
  if (ch === '{') c++;
  else if (ch === '}') c--;
  else if (ch === '(') p++;
  else if (ch === ')') p--;
  else if (ch === '[') b++;
  else if (ch === ']') b--;
}
console.log(JSON.stringify({ braces: c, parens: p, brackets: b, lines: t.split('\n').length }));
