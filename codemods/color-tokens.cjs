const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '..', 'tokens', 'primitive-tokens.json');
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function isHexColor(value) {
  return HEX_COLOR_PATTERN.test(value);
}

function normalizeHex(value) {
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    return null;
  }

  const hex = value.slice(1).toLowerCase();
  return hex.length === 3
    ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
    : `#${hex}`;
}

function parseRgb(value) {
  if (!isHexColor(value)) {
    return null;
  }

  let hex = value.slice(1);
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .slice(0, 3)
      .split('')
      .map((digit) => `${digit}${digit}`)
      .join('');
  } else {
    hex = hex.slice(0, 6);
  }

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function loadTokens(tokenFile = TOKEN_FILE) {
  const data = JSON.parse(fs.readFileSync(tokenFile, 'utf8'));
  if (!data.color || typeof data.color !== 'object' || Array.isArray(data.color)) {
    throw new Error(`Expected a "color" token object in ${tokenFile}`);
  }

  const tokens = Object.entries(data.color).map(([name, value]) => {
    const hex = normalizeHex(value);
    if (!hex) {
      throw new Error(`Color token "${name}" must be a 3- or 6-digit hex value`);
    }
    return { name, hex };
  });

  const byHex = new Map();
  for (const token of tokens) {
    if (!byHex.has(token.hex)) {
      byHex.set(token.hex, token.name);
    }
  }

  return { tokens, byHex };
}

function nearestToken(value, tokens) {
  const rgb = parseRgb(value);
  if (!rgb) {
    return null;
  }

  let nearest = null;
  for (const token of tokens) {
    const candidate = parseRgb(token.hex);
    const distance = rgb.reduce(
      (sum, channel, index) => sum + (channel - candidate[index]) ** 2,
      0,
    );
    if (!nearest || distance < nearest.distance) {
      nearest = { name: token.name, hex: token.hex, distance };
    }
  }

  return nearest;
}

function variableForToken(name) {
  return `var(--color-${name})`;
}

module.exports = {
  isHexColor,
  loadTokens,
  nearestToken,
  normalizeHex,
  variableForToken,
};