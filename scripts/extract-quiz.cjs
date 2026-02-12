const fs = require('fs');
const path = require('path');
const htmlPath = path.join(__dirname, '../../public/index.html');
const outPath = path.join(__dirname, '../src/data/quizDatabase.js');
const html = fs.readFileSync(htmlPath, 'utf8');
const startMarker = 'const QUIZ_DATABASE = ';
const startIdx = html.indexOf(startMarker);
if (startIdx === -1) throw new Error('QUIZ_DATABASE not found');
let i = html.indexOf('{', startIdx);
let depth = 0;
let endIdx = i;
for (let j = i; j < html.length; j++) {
  const c = html[j];
  if (c === '"' || c === "'") {
    const q = c;
    j++;
    while (j < html.length && (html[j] !== q || html[j - 1] === '\\')) j++;
    continue;
  }
  if (c === '{') depth++;
  else if (c === '}') { depth--; if (depth === 0) { endIdx = j; break; } }
}
const objStr = html.slice(i, endIdx + 1);
let obj;
try {
  obj = new Function('return ' + objStr)();
} catch (e) {
  throw new Error('Parse failed: ' + e.message);
}
const tests = Object.values(obj).map(t => ({ id: t.id, title: t.title, passing_score: t.passing_score || 85 }));
const out = `// Extracted from public/index.html - Practice Test / Official Test Database
export const QUIZ_DATABASE = ${JSON.stringify(obj, null, 2)};

export const TESTS = ${JSON.stringify(tests, null, 2)};

export const SHIFT_TEST_RULES = [
  { shift: 'follow', testsAnyOf: [['starters', 'soups']] },
  { shift: 'rev1', testsAnyOf: [['steaks', 'specialties']] },
  { shift: 'rev2', testsAnyOf: [['bar', 'beer']] },
  { shift: 'rev3', testsAnyOf: [] },
  { shift: 'rev4', testsAnyOf: [] },
  { shift: 'foodrun', testsAnyOf: [['wine', 'cocktail'], ['wine', 'cocktails']] },
  { shift: 'cert', testsAnyOf: [] },
];

export const PRETTY_TEST_NAMES = {
  bar_test: 'Bar & Beer Test',
  starters_soups_test: 'Starters, Soups & Salads Test',
  soups_test: 'Soups Test',
  steaks_specialties_test: 'Steaks & Specialties Test',
  steaks_test: 'Steaks & Specialties Test',
  wine_cocktails_test: 'Wine & Cocktails Test',
  wines_test: 'Wine & Cocktails Test',
  wine_test: 'Wine & Cocktails Test',
};
`;
fs.writeFileSync(outPath, out, 'utf8');
console.log('Wrote', outPath);
