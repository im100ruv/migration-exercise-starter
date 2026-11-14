const assert = require('assert');
const fs = require('fs');
const path = require('path');
const jscodeshift = require('jscodeshift');
const migrateButton = require('../migrate-button.cjs');

const j = jscodeshift.withParser('tsx');
const fixtures = path.join(__dirname, 'fixtures');

function transform(source, filePath = 'fixture.tsx') {
  const reports = [];
  const output = migrateButton(
    { path: filePath, source },
    { jscodeshift: j },
    { onReport: (message) => reports.push(message) },
  );
  return { output, reports };
}

function test(name, callback) {
  try {
    callback();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test('migrates the fixture and is idempotent', () => {
  const input = fs.readFileSync(path.join(fixtures, 'button-input.tsx'), 'utf8');
  const expected = fs.readFileSync(path.join(fixtures, 'button-output.tsx'), 'utf8');
  const first = transform(input, 'button-input.tsx');

  assert.strictEqual(first.reports.length, 0);
  assert.strictEqual(first.output, expected);

  const second = transform(first.output, 'button-output.tsx');
  assert.strictEqual(second.reports.length, 0);
  assert.strictEqual(second.output, first.output);
});

test('migrates a namespace Button and retains other old library components', () => {
  const source = [
    "import * as UI from '@old/ui';",
    'export const Example = () => (',
    '  <UI.Card><UI.Button variant="danger" size="lg">Delete</UI.Button></UI.Card>',
    ');',
  ].join('\n');
  const { output, reports } = transform(source);

  assert.strictEqual(reports.length, 0);
  assert.ok(/import \* as UI from '@old\/ui';/.test(output));
  assert.ok(/import \{ Button as AcmeButton \} from "@acme\/ds";/.test(output));
  assert.ok(/<UI\.Card><AcmeButton intent="critical" size="large">Delete<\/AcmeButton><\/UI\.Card>/.test(output));
  assert.ok(!/<UI\.Button/.test(output));
});

test('leaves an ambiguous Button unchanged, migrates safe uses, and reports the reason', () => {
  const source = [
    "import { Button } from '@old/ui';",
    'export const Example = ({ choice }) => (',
    '  <div>',
    '    <Button variant={getVariant(choice)}>Unknown</Button>',
    '    <Button variant="primary">Known</Button>',
    '  </div>',
    ');',
  ].join('\n');
  const { output, reports } = transform(source, 'ambiguous.tsx');

  assert.ok(/import \{ Button \} from '@old\/ui';/.test(output));
  assert.ok(/import \{ Button as AcmeButton \} from "@acme\/ds";/.test(output));
  assert.ok(/<Button variant=\{getVariant\(choice\)\}>Unknown<\/Button>/.test(output));
  assert.ok(/<AcmeButton intent="brand">Known<\/AcmeButton>/.test(output));
  assert.strictEqual(reports.length, 1);
  assert.ok(/ambiguous\.tsx:4: dynamic or missing variant value/.test(reports[0]));
});