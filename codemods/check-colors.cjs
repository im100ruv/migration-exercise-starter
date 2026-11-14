const fs = require('fs');
const path = require('path');
const { formatUnmatched, listFiles, transformSource } = require('./migrate-colors.cjs');
const { loadTokens } = require('./color-tokens.cjs');

const ALLOWLIST_FILE = path.join(__dirname, 'color-allowlist.json');

function occurrenceKey(occurrence) {
  return `${occurrence.file}:${occurrence.line}:${occurrence.value.toLowerCase()}`;
}

function evaluateOccurrences(occurrences, allowlist) {
  const allowedCounts = new Map();
  for (const entry of allowlist.entries) {
    const key = occurrenceKey(entry);
    allowedCounts.set(key, entry.count || 1);
  }

  const seen = new Map();
  const violations = [];
  let allowed = 0;
  for (const occurrence of occurrences) {
    const key = occurrenceKey(occurrence);
    const count = (seen.get(key) || 0) + 1;
    seen.set(key, count);
    if (count <= (allowedCounts.get(key) || 0)) {
      allowed += 1;
    } else {
      violations.push(occurrence);
    }
  }

  return { allowed, violations };
}

function checkColors(target, allowlistPath = ALLOWLIST_FILE) {
  const tokenData = loadTokens();
  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
  if (!Array.isArray(allowlist.entries)) {
    throw new Error(`Expected an "entries" array in ${allowlistPath}`);
  }

  const occurrences = [];
  for (const file of listFiles(target)) {
    const source = fs.readFileSync(file, 'utf8');
    const relativeFile = path.relative(process.cwd(), file).split(path.sep).join('/');
    occurrences.push(...transformSource(source, relativeFile, tokenData).occurrences);
  }

  const result = evaluateOccurrences(occurrences, allowlist);
  if (result.allowed > 0) {
    console.log(`Allowed ${result.allowed} documented color exception(s).`);
  }
  if (result.violations.length > 0) {
    console.error('Hard-coded colors found:');
    result.violations.forEach((occurrence) => {
      const details = occurrence.token
        ? `maps to ${occurrence.variable}`
        : formatUnmatched(occurrence);
      console.error(`  ${occurrence.file}:${occurrence.line}: ${occurrence.value} (${details})`);
    });
    process.exitCode = 1;
  } else {
    console.log('No unapproved hard-coded colors found.');
  }

  return result;
}

if (require.main === module) {
  const target = process.argv[2] || path.join(__dirname, '..', 'apps', 'web-dashboard', 'src');
  checkColors(target);
}

module.exports = { checkColors, evaluateOccurrences };