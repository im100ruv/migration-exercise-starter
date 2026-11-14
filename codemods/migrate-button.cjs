const VARIANT_MAP = {
  primary: 'brand',
  secondary: 'neutral',
  danger: 'critical',
};

const SIZE_MAP = {
  sm: 'small',
  md: 'medium',
  lg: 'large',
};

const OLD_UI = '@old/ui';
const NEW_UI = '@acme/ds';

function importedName(specifier) {
  return specifier.imported.name || specifier.imported.value;
}

function localName(specifier) {
  return specifier.local ? specifier.local.name : importedName(specifier);
}

function resolvesToImport(path, name, specifier) {
  const bindings = path.scope?.lookup(name)?.getBindings?.()[name] || [];
  return bindings.some((binding) => binding.node === specifier.local);
}

function isButtonVariantType(node, path, specifier) {
  if (
    node?.type !== 'TSIndexedAccessType' ||
    node.objectType?.type !== 'TSTypeReference' ||
    node.objectType.typeName?.type !== 'Identifier' ||
    node.indexType?.type !== 'TSLiteralType' ||
    node.indexType.literal?.value !== 'variant'
  ) {
    return false;
  }

  const name = node.objectType.typeName.name;
  return name === localName(specifier) && resolvesToImport(path, name, specifier);
}

function collectVariantPropNames(root, j, typeSpecifiers) {
  const names = new Set();
  root.find(j.TSPropertySignature).forEach((path) => {
    if (
      typeSpecifiers.some((specifier) =>
        isButtonVariantType(path.node.typeAnnotation?.typeAnnotation, path, specifier),
      ) &&
      path.node.key.type === 'Identifier'
    ) {
      names.add(path.node.key.name);
    }
  });
  return names;
}

function mapLiteralExpression(node, mapping) {
  if (node?.type === 'StringLiteral' || node?.type === 'Literal') {
    const mapped = mapping[node.value];
    if (mapped) {
      return {
        safe: true,
        apply() {
          setStringValue(node, mapped);
        },
      };
    }
    return { safe: false };
  }

  if (node?.type === 'ConditionalExpression') {
    const consequent = mapLiteralExpression(node.consequent, mapping);
    const alternate = mapLiteralExpression(node.alternate, mapping);
    if (consequent.safe && alternate.safe) {
      return {
        safe: true,
        apply() {
          consequent.apply();
          alternate.apply();
        },
      };
    }
  }

  return { safe: false };
}

function setStringValue(node, value) {
  node.value = value;
  if (node.extra) {
    const raw = node.extra.raw || '';
    const quote = raw.startsWith("'") ? "'" : '"';
    const escaped = value.replace(/\\/g, '\\\\').split(quote).join(`\\${quote}`);
    node.extra.rawValue = value;
    node.extra.raw = `${quote}${escaped}${quote}`;
  }
}

function planAttributeChanges(element, j, variantPropNames) {
  const attributes = element.openingElement.attributes.filter(
    (attribute) => attribute.type === 'JSXAttribute',
  );
  const names = attributes.map((attribute) => attribute.name.name);
  const changes = [];

  for (const [source, target, mapping] of [
    ['variant', 'intent', VARIANT_MAP],
    ['size', 'size', SIZE_MAP],
  ]) {
    const sourceAttributes = attributes.filter((attribute) => attribute.name.name === source);
    if (sourceAttributes.length === 0) {
      continue;
    }
    if (
      sourceAttributes.length > 1 ||
      (source !== target && names.includes(target))
    ) {
      return { safe: false, reason: `conflicting ${source}/${target} attributes` };
    }

    const attribute = sourceAttributes[0];
    const value = attribute.value;
    if (value?.type === 'StringLiteral' || value?.type === 'Literal') {
      const mapped = mapping[value.value];
      if (!mapped) {
        return { safe: false, reason: `unrecognized ${source} value "${value.value}"` };
      }
      changes.push(() => setStringValue(value, mapped));
      if (source !== target) {
        changes.push(() => {
          attribute.name.name = target;
        });
      }
      continue;
    }

    if (value?.type === 'JSXExpressionContainer') {
      const expression = value.expression;
      if (source === 'variant' && expression.type === 'Identifier' && variantPropNames.has(expression.name)) {
        changes.push(() => {
          attribute.name.name = target;
        });
        continue;
      }

      const mapped = mapLiteralExpression(expression, mapping);
      if (mapped.safe) {
        changes.push(() => {
          mapped.apply();
          if (source !== target) {
            attribute.name.name = target;
          }
        });
        continue;
      }
    }

    return { safe: false, reason: `dynamic or missing ${source} value` };
  }

  const blockAttributes = attributes.filter((attribute) => attribute.name.name === 'block');
  if (blockAttributes.length > 1 || (blockAttributes.length && names.includes('fullWidth'))) {
    return { safe: false, reason: 'conflicting block/fullWidth attributes' };
  }

  if (blockAttributes.length === 1) {
    const attribute = blockAttributes[0];
    const value = attribute.value;
    if (value && value.type !== 'JSXExpressionContainer') {
      return { safe: false, reason: 'unsupported block value' };
    }
    changes.push(() => {
      attribute.name.name = 'fullWidth';
    });
  }

  return { safe: true, apply: () => changes.forEach((change) => change()) };
}

function jsxNameForBinding(element, specifier, j) {
  const name = element.node.openingElement.name;
  if (specifier.type === 'ImportSpecifier') {
    const local = localName(specifier);
    return (
      name.type === 'JSXIdentifier' &&
      name.name === local &&
      resolvesToImport(element, local, specifier)
    );
  }

  if (specifier.type === 'ImportNamespaceSpecifier') {
    const namespace = localName(specifier);
    return (
      name.type === 'JSXMemberExpression' &&
      name.object.type === 'JSXIdentifier' &&
      name.object.name === namespace &&
      name.property.type === 'JSXIdentifier' &&
      name.property.name === 'Button' &&
      resolvesToImport(element, namespace, specifier)
    );
  }

  return false;
}

function setJsxTag(element, name, j) {
  element.openingElement.name = j.jsxIdentifier(name);
  if (element.closingElement) {
    element.closingElement.name = j.jsxIdentifier(name);
  }
}

function uniqueLocalName(root, j, preferred) {
  const identifiers = new Set(root.find(j.Identifier).nodes().map((node) => node.name));
  if (!identifiers.has(preferred)) {
    return preferred;
  }

  const base = preferred === 'Button' ? 'AcmeButton' : `${preferred}Acme`;
  let candidate = base;
  let suffix = 2;
  while (identifiers.has(candidate)) {
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function isTypeReference(path) {
  let current = path.parentPath;
  while (current) {
    if (current.node.type.startsWith('TS')) {
      return true;
    }
    current = current.parentPath;
  }
  return false;
}

function isJsxTagReference(path) {
  const parent = path.parentPath?.node;
  return (
    (parent?.type === 'JSXOpeningElement' || parent?.type === 'JSXClosingElement') &&
    parent.name === path.node
  );
}

function unsupportedNamedReferences(root, j, specifier) {
  const name = localName(specifier);
  const references = [];
  root.find(j.Identifier, { name }).forEach((path) => {
    if (
      path.node !== specifier.local &&
      path.parentPath?.node.type !== 'ImportSpecifier' &&
      resolvesToImport(path, name, specifier) &&
      !isJsxTagReference(path) &&
      !isTypeReference(path)
    ) {
      references.push(path);
    }
  });
  return references;
}

function namespaceButtonReferences(root, j, specifier) {
  const namespace = localName(specifier);
  const references = [];
  root.find(j.MemberExpression).forEach((path) => {
    if (
      path.node.object.type === 'Identifier' &&
      path.node.object.name === namespace &&
      path.node.property.type === 'Identifier' &&
      path.node.property.name === 'Button' &&
      resolvesToImport(path, namespace, specifier)
    ) {
      references.push(path);
    }
  });
  return references;
}

function ensureAcmeImport(root, j, imported, local, importKind) {
  const program = root.find(j.Program).get().node;
  let declaration = program.body.find(
    (node) =>
      node.type === 'ImportDeclaration' &&
      node.source.value === NEW_UI &&
      node.importKind !== 'type',
  );

  if (
    declaration?.specifiers.some(
      (specifier) =>
        specifier.type === 'ImportSpecifier' &&
        importedName(specifier) === imported &&
        localName(specifier) === local,
    )
  ) {
    return;
  }

  const specifier = j.importSpecifier(
    j.identifier(imported),
    imported === local ? null : j.identifier(local),
  );
  if (importKind) {
    specifier.importKind = importKind;
  }

  if (declaration) {
    declaration.specifiers.push(specifier);
    return;
  }

  declaration = j.importDeclaration([specifier], j.literal(NEW_UI));
  const lastImportIndex = program.body.reduce(
    (lastIndex, node, index) => (node.type === 'ImportDeclaration' ? index : lastIndex),
    -1,
  );
  program.body.splice(lastImportIndex + 1, 0, declaration);
}

function removeUnusedOldImports(root, j, movedSpecifiers) {
  const moved = new Set(movedSpecifiers);
  root.find(j.ImportDeclaration, { source: { value: OLD_UI } }).forEach((path) => {
    path.node.specifiers = path.node.specifiers.filter((specifier) => !moved.has(specifier));
    if (path.node.specifiers.length === 0) {
      path.prune();
    }
  });
}

function migrateButtonProps(root, j, typeSpecifiers, movedSpecifiers) {
  for (const specifier of typeSpecifiers) {
    const name = localName(specifier);
    let updated = false;
    root.find(j.TSIndexedAccessType).forEach((path) => {
      if (isButtonVariantType(path.node, path, specifier)) {
        setStringValue(path.node.indexType.literal, 'intent');
        updated = true;
      }
    });
    if (updated) {
      movedSpecifiers.push(specifier);
      ensureAcmeImport(root, j, 'ButtonProps', name, specifier.importKind);
    }
  }
}

module.exports = function migrateButton(fileInfo, api, options = {}) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  const report = (line, reason) => {
    const message = `${fileInfo.path}:${line}: ${reason}`;
    if (typeof options.onReport === 'function') {
      options.onReport(message);
    } else {
      console.warn(`[migrate-button] ${message}`);
    }
  };
  const oldImports = root.find(j.ImportDeclaration, { source: { value: OLD_UI } }).paths();
  const typeSpecifiers = oldImports.flatMap((path) =>
    path.node.specifiers.filter(
      (specifier) =>
        specifier.type === 'ImportSpecifier' && importedName(specifier) === 'ButtonProps',
    ),
  );
  const variantPropNames = collectVariantPropNames(root, j, typeSpecifiers);
  const movedSpecifiers = [];
  let foundButtonUse = false;
  let allButtonUsesMigrated = true;

  for (const importPath of oldImports) {
    const buttonSpecifiers = importPath.node.specifiers.filter(
      (specifier) =>
        specifier.type === 'ImportSpecifier' &&
        importedName(specifier) === 'Button',
    );

    for (const specifier of buttonSpecifiers) {
      const elements = root
        .find(j.JSXElement)
        .filter((path) => jsxNameForBinding(path, specifier, j))
        .paths();
      const unsupported = unsupportedNamedReferences(root, j, specifier);
      if (elements.length === 0 && unsupported.length === 0) {
        continue;
      }

      foundButtonUse = true;
      const plans = elements.map((path) => ({
        path,
        plan: planAttributeChanges(path.node, j, variantPropNames),
      }));
      const safePlans = plans.filter(({ plan }) => plan.safe);
      const allSafe = safePlans.length === plans.length && unsupported.length === 0;
      if (!allSafe) {
        allButtonUsesMigrated = false;
      }

      plans
        .filter(({ plan }) => !plan.safe)
        .forEach(({ path, plan }) => report(path.node.loc.start.line, plan.reason));
      unsupported.forEach((path) =>
        report(path.node.loc.start.line, 'non-JSX Button reference left unchanged'),
      );

      if (safePlans.length === 0) {
        continue;
      }

      const targetLocal = allSafe
        ? localName(specifier)
        : uniqueLocalName(root, j, 'AcmeButton');
      for (const { path, plan } of safePlans) {
        plan.apply();
        if (targetLocal !== localName(specifier)) {
          setJsxTag(path.node, targetLocal, j);
        }
      }

      if (allSafe) {
        movedSpecifiers.push(specifier);
      }
      ensureAcmeImport(root, j, 'Button', targetLocal, specifier.importKind);
    }

    const namespaceSpecifiers = importPath.node.specifiers.filter(
      (specifier) => specifier.type === 'ImportNamespaceSpecifier',
    );
    for (const specifier of namespaceSpecifiers) {
      const elements = root
        .find(j.JSXElement)
        .filter((path) => jsxNameForBinding(path, specifier, j))
        .paths();
      const unsupported = namespaceButtonReferences(root, j, specifier);
      if (elements.length === 0 && unsupported.length === 0) {
        continue;
      }

      foundButtonUse = true;
      const plans = elements.map((path) => ({
        path,
        plan: planAttributeChanges(path.node, j, variantPropNames),
      }));
      const allSafe = plans.every(({ plan }) => plan.safe) && unsupported.length === 0;
      if (!allSafe) {
        allButtonUsesMigrated = false;
      }
      plans
        .filter(({ plan }) => !plan.safe)
        .forEach(({ path, plan }) => report(path.node.loc.start.line, plan.reason));
      unsupported.forEach((path) =>
        report(path.node.loc.start.line, 'non-JSX namespace Button reference left unchanged'),
      );

      const safePlans = plans.filter(({ plan }) => plan.safe);
      if (safePlans.length === 0) {
        continue;
      }
      const targetLocal = uniqueLocalName(root, j, 'Button');
      for (const { path, plan } of safePlans) {
        plan.apply();
        setJsxTag(path.node, targetLocal, j);
      }
      ensureAcmeImport(root, j, 'Button', targetLocal);
    }
  }

  if (foundButtonUse && allButtonUsesMigrated) {
    migrateButtonProps(root, j, typeSpecifiers, movedSpecifiers);
  }
  removeUnusedOldImports(root, j, movedSpecifiers);

  return root.toSource({ quote: 'auto' });
};