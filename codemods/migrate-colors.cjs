const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const valueParser = require('postcss-value-parser');
const ts = require('typescript');
const {
  isHexColor,
  loadTokens,
  nearestToken,
  normalizeHex,
  variableForToken,
} = require('./color-tokens.cjs');

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

function colorNodes(nodes, visit) {
  for (const node of nodes) {
    if (node.type === 'function') {
      if (node.value.toLowerCase() !== 'url') {
        colorNodes(node.nodes || [], visit);
      }
      continue;
    }

    if (node.type === 'word' && isHexColor(node.value)) {
      visit(node);
    }
  }
}

function inspectValue(raw, file, line, tokenData) {
  const parsed = valueParser(raw);
  const occurrences = [];
  const edits = [];

  colorNodes(parsed.nodes, (node) => {
    const token = tokenData.byHex.get(normalizeHex(node.value));
    const nearest = token ? null : nearestToken(node.value, tokenData.tokens);
    occurrences.push({
      file,
      line,
      value: node.value,
      token,
      variable: token ? variableForToken(token) : null,
      nearest,
    });

    if (token) {
      edits.push({
        start: node.sourceIndex,
        end: node.sourceEndIndex,
        replacement: variableForToken(token),
      });
      node.value = variableForToken(token);
    }
  });

  return { occurrences, edits, value: parsed.toString() };
}

function lineAt(source, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function transformCss(source, file, tokenData) {
  const root = postcss.parse(source, { from: file });
  const occurrences = [];

  root.walkDecls((declaration) => {
    const parsed = valueParser(declaration.value);
    let changed = false;
    const valueStart =
      declaration.source.start.offset +
      declaration.prop.length +
      (declaration.raws.between || ':').length;

    colorNodes(parsed.nodes, (node) => {
      const absoluteOffset = valueStart + node.sourceIndex;
      const token = tokenData.byHex.get(normalizeHex(node.value));
      const nearest = token ? null : nearestToken(node.value, tokenData.tokens);
      occurrences.push({
        file,
        line: lineAt(source, absoluteOffset),
        value: node.value,
        token,
        variable: token ? variableForToken(token) : null,
        nearest,
      });

      if (token) {
        node.value = variableForToken(token);
        changed = true;
      }
    });

    if (changed) {
      declaration.value = parsed.toString();
    }
  });

  return { output: root.toString(), occurrences };
}

function propertyName(node, sourceFile) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
    return node.text;
  }
  return node.getText(sourceFile);
}

function isColorProperty(name) {
  return /^(?:color|background(?:color)?|border(?:color|top|right|bottom|left)?|outline(?:color)?|fill|stroke|boxshadow|textshadow)$/i.test(
    name,
  );
}

function isColorVariableName(name) {
  return /(?:colors?|palette|border|background|fill|stroke)/i.test(name);
}

function isColorSeriesArray(node, declaration, sourceFile) {
  let current = node;
  while (current && current !== declaration) {
    if (ts.isArrayLiteralExpression(current)) {
      const values = current.elements.map((element) => {
        if (!ts.isStringLiteralLike(element)) {
          return null;
        }
        return element.getText(sourceFile).slice(1, -1).trim();
      });
      return (
        values.length > 0 &&
        values.every(
          (value) =>
            value !== null &&
            (isHexColor(value) || /^var\(--color-[a-z0-9-]+\)$/i.test(value)),
        ) &&
        values.some((value) => isHexColor(value))
      );
    }
    current = current.parent;
  }
  return false;
}

function isColorStringContext(node, sourceFile) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;

    if (ts.isPropertyAssignment(parent) && parent.initializer === current) {
      if (isColorProperty(propertyName(parent.name, sourceFile))) {
        return true;
      }
    }

    if (ts.isJsxAttribute(parent) && parent.initializer === current) {
      if (isColorProperty(parent.name.getText(sourceFile))) {
        return true;
      }
    }

    if (
      ts.isCallExpression(parent) &&
      parent.arguments.includes(current) &&
      isColorVariableName(parent.expression.getText(sourceFile))
    ) {
      return true;
    }

    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      if (isColorVariableName(parent.name.text)) {
        return true;
      }
      if (
        /series/i.test(parent.name.text) &&
        isColorSeriesArray(node, parent, sourceFile)
      ) {
        return true;
      }
    }

    current = parent;
  }
  return false;
}

function transformSourceText(source, file, tokenData) {
  const extension = path.extname(file).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(extension)) {
    return { output: source, occurrences: [] };
  }

  const scriptKind =
    extension === '.tsx'
      ? ts.ScriptKind.TSX
      : extension === '.jsx'
        ? ts.ScriptKind.JSX
        : extension === '.js'
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind);
  const occurrences = [];
  const edits = [];

  function visit(node) {
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      isColorStringContext(node, sourceFile)
    ) {
      const start = node.getStart(sourceFile) + 1;
      const end = node.getEnd() - 1;
      const raw = source.slice(start, end);
      const position = sourceFile.getLineAndCharacterOfPosition(start);
      const inspected = inspectValue(raw, file, position.line + 1, tokenData);
      occurrences.push(...inspected.occurrences);
      edits.push(
        ...inspected.edits.map((edit) => ({
          start: start + edit.start,
          end: start + edit.end,
          replacement: edit.replacement,
        })),
      );
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  edits.sort((left, right) => right.start - left.start);
  let output = source;
  for (const edit of edits) {
    output = `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.end)}`;
  }
  return { output, occurrences };
}

function transformSource(source, file, tokenData) {
  return path.extname(file).toLowerCase() === '.css'
    ? transformCss(source, file, tokenData)
    : transformSourceText(source, file, tokenData);
}

function listFiles(target) {
  const absoluteTarget = path.resolve(target);
  const stat = fs.statSync(absoluteTarget);
  if (stat.isFile()) {
    return [absoluteTarget];
  }

  const files = [];
  for (const entry of fs.readdirSync(absoluteTarget, { withFileTypes: true })) {
    const entryPath = path.join(absoluteTarget, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        files.push(...listFiles(entryPath));
      }
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.css') || SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    ) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function formatUnmatched(occurrence) {
  const suggestion = occurrence.nearest
    ? `nearest token: ${occurrence.nearest.name} (${occurrence.nearest.hex})`
    : 'no nearest token available';
  return `${occurrence.file}:${occurrence.line}: ${occurrence.value} has no exact token; ${suggestion}`;
}

function runMigration(target, { dryRun = false } = {}) {
  const tokenData = loadTokens();
  const files = listFiles(target);
  const pending = files.map((file) => {
    const source = fs.readFileSync(file, 'utf8');
    const relativeFile = path.relative(process.cwd(), file).split(path.sep).join('/');
    return {
      file,
      relativeFile,
      source,
      result: transformSource(source, relativeFile, tokenData),
    };
  });
  const unmatched = [];
  let changedFiles = 0;
  let migratedColors = 0;

  for (const { file, relativeFile, source, result } of pending) {
    migratedColors += result.occurrences.filter((occurrence) => occurrence.token).length;
    unmatched.push(...result.occurrences.filter((occurrence) => !occurrence.token));

    if (result.output !== source) {
      changedFiles += 1;
      if (dryRun) {
        console.log(`Would update ${relativeFile}`);
      } else {
        fs.writeFileSync(file, result.output);
        console.log(`Updated ${relativeFile}`);
      }
    }
  }

  console.log(
    `${dryRun ? 'Would migrate' : 'Migrated'} ${migratedColors} token match(es) in ${changedFiles} file(s).`,
  );
  if (unmatched.length > 0) {
    console.log('Unmatched colors (left unchanged):');
    unmatched.forEach((occurrence) => console.log(`  ${formatUnmatched(occurrence)}`));
  }
  return { changedFiles, migratedColors, unmatched };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRunIndex = args.indexOf('--dry-run');
  const dryRun = dryRunIndex !== -1;
  if (dryRun) {
    args.splice(dryRunIndex, 1);
  }
  const target = args[0] || path.join(__dirname, '..', 'apps', 'web-dashboard', 'src');
  runMigration(target, { dryRun });
}

module.exports = {
  formatUnmatched,
  listFiles,
  runMigration,
  transformSource,
};