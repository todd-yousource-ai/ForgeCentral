// packages/contracts/scripts/generate.mjs -- the wire-DTO TypeScript emitter (F0.1).
//
// Reads the vendored Crucible wire DTO JSON Schema (schema/wire-dto.schema.json, an exact copy of the
// crdb committed artifact crates/cdb-wire/schema/wire-dto.schema.json) and emits the TypeScript type
// projection to src/generated/wire-dto.ts. The engine is the single source of truth: these types are
// generated, never hand-authored (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE). A codegen round-trip test
// (test/contracts.test.ts) asserts the committed output equals this emitter's output, so a wire change
// that is not regenerated fails the gate -- the same drift discipline crdb applies in CR.A2.
//
// Regenerate with:  node scripts/generate.mjs   (from packages/contracts)
//
// The emitter covers exactly the draft-2020-12 constructs the contract uses (external-tagging via
// oneOf single-key objects and const strings, $ref, enums, tuples via prefixItems, nullable via
// oneOf-with-null, primitive/array/object shapes). An unsupported construct throws rather than emit a
// silently-wrong type.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** A single-quoted TS string literal for a simple (identifier-like) value. */
function lit(value) {
  if (typeof value !== 'string') {
    throw new Error(`only string literals are supported, got ${JSON.stringify(value)}`);
  }
  if (!IDENT.test(value)) {
    throw new Error(`literal is not a safe identifier string: ${JSON.stringify(value)}`);
  }
  return `'${value}'`;
}

/** "#/$defs/WireValue" -> "WireValue". */
function refName(ref) {
  const match = /^#\/\$defs\/(.+)$/.exec(ref);
  if (!match) {
    throw new Error(`unsupported $ref (only #/$defs/<Name> is supported): ${ref}`);
  }
  return match[1];
}

/** The TypeScript type for an arbitrary (inline or referenced) schema node. */
function tsType(schema) {
  if (schema.$ref) {
    return refName(schema.$ref);
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    return lit(schema.const);
  }
  if (schema.enum) {
    return schema.enum.map(lit).join(' | ');
  }
  if (schema.oneOf) {
    return schema.oneOf.map(tsType).join(' | ');
  }
  switch (schema.type) {
    case 'string':
      return 'string';
    case 'integer':
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    case 'array':
      if (schema.prefixItems) {
        return `[${schema.prefixItems.map(tsType).join(', ')}]`;
      }
      return `Array<${tsType(schema.items)}>`;
    case 'object':
      return objectLiteral(schema);
    default:
      throw new Error(`unsupported schema node: ${JSON.stringify(schema)}`);
  }
}

/** The `key: type;` member lines for an object schema, marking non-required keys optional. */
function propertyLines(schema) {
  const required = new Set(schema.required ?? []);
  const properties = schema.properties ?? {};
  return Object.keys(properties).map((key) => {
    const optional = required.has(key) ? '' : '?';
    const name = IDENT.test(key) ? key : lit(key);
    return `${name}${optional}: ${tsType(properties[key])};`;
  });
}

/** An inline `{ k: T; ... }` object type (or Record<string, never> for the empty object). */
function objectLiteral(schema) {
  const lines = propertyLines(schema);
  if (lines.length === 0) {
    return 'Record<string, never>';
  }
  return `{ ${lines.join(' ')} }`;
}

/** A top-level `$defs` entry -> an `export type` (enum / union) or `export interface` (object). */
function renderDef(name, def) {
  if (def.enum) {
    return `export type ${name} = ${def.enum.map(lit).join(' | ')};`;
  }
  if (def.oneOf) {
    const variants = def.oneOf.map(tsType);
    return `export type ${name} =\n  | ${variants.join('\n  | ')};`;
  }
  if (def.type === 'object') {
    const lines = propertyLines(def);
    const body = lines.map((line) => `  ${line}`).join('\n');
    return `export interface ${name} {\n${body}\n}`;
  }
  throw new Error(`unsupported top-level def ${name}: ${JSON.stringify(def)}`);
}

/** Render the whole generated module from a parsed wire DTO schema object. */
export function renderWireDtoTypes(schema) {
  const defs = schema.$defs ?? {};
  const names = Object.keys(defs).sort();
  const body = names.map((name) => renderDef(name, defs[name])).join('\n\n');
  const header = [
    '// GENERATED FILE -- DO NOT EDIT BY HAND.',
    '//',
    '// The TypeScript projection of the Crucible wire DTO contract, emitted from the vendored schema',
    `// schema/wire-dto.schema.json (${schema.$id}) by scripts/generate.mjs.`,
    '// The engine is the single source of truth (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE); regenerate with',
    '//   node scripts/generate.mjs',
    '// A codegen round-trip test asserts this file equals the emitter output, so an un-regenerated wire',
    '// change fails the gate. Edit the schema (upstream, in crdb), not this file.',
    '',
    '',
  ].join('\n');
  return `${header}${body}\n`;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const here = dirname(fileURLToPath(import.meta.url));
  const schemaPath = join(here, '..', 'schema', 'wire-dto.schema.json');
  const outPath = join(here, '..', 'src', 'generated', 'wire-dto.ts');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  writeFileSync(outPath, renderWireDtoTypes(schema));
  // eslint-disable-next-line no-console -- CLI progress line; this file is build tooling, not linted src.
  console.log(`generated ${outPath} from ${schema.$id}`);
}
