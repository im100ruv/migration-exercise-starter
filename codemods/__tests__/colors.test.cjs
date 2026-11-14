const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { evaluateOccurrences } = require('../check-colors.cjs');
const { loadTokens } = require('../color-tokens.cjs');
const { transformSource } = require('../migrate-colors.cjs');

const fixtures = path.join(__dirname, 'fixtures');
const tokenData = loadTokens();

function test(name, callback) {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('maps TSX color strings while preserving IDs, routes, and data selectors', () => {
  const input = fs.readFileSync(path.join(fixtures, 'colors-input.fixture'), 'utf8');
  const expected = fs.readFileSync(path.join(fixtures, 'colors-output.fixture'), 'utf8');
  const result = transformSource(input, 'fixture.tsx', tokenData);

  assert.strictEqual(result.output, expected);
  assert.deepStrictEqual(
    result.occurrences.filter((occurrence) => !occurrence.token).map((occurrence) => occurrence.value),
    ['#FF6D00'],
  );
  assert.strictEqual(result.occurrences.find((occurrence) => !occurrence.token).nearest.name, 'red-500');
});

test('maps CSS declaration colors but leaves comments, selectors, URLs, and unmatched colors intact', () => {
  const input = fs.readFileSync(path.join(fixtures, 'colors-input.css'), 'utf8');
  const expected = fs.readFileSync(path.join(fixtures, 'colors-output.css'), 'utf8');
  const result = transformSource(input, 'fixture.css', tokenData);

  assert.strictEqual(result.output, expected);
  assert.deepStrictEqual(
    result.occurrences.filter((occurrence) => !occurrence.token).map((occurrence) => occurrence.value),
    ['#FF6D00', '#1a73e8cc'],
  );
  assert.strictEqual(result.occurrences.find((occurrence) => occurrence.value === '#1a73e8cc').nearest.name, 'blue-500');
});

test('allows only the documented number of matching file, line, and value exceptions', () => {
  const occurrence = { file: 'src/theme.css', line: 12, value: '#FF6D00' };
  const result = evaluateOccurrences(
    [occurrence, occurrence],
    { entries: [{ ...occurrence, count: 1 }] },
  );

  assert.strictEqual(result.allowed, 1);
  assert.strictEqual(result.violations.length, 1);
});

test('rejects a newly introduced hard-coded color even when it has a token match', () => {
  const occurrences = transformSource('.sample { color: #fff; }', 'src/new.css', tokenData)
    .occurrences;
  const result = evaluateOccurrences(occurrences, { entries: [] });

  assert.strictEqual(result.violations.length, 1);
  assert.strictEqual(result.violations[0].token, 'white');
});
