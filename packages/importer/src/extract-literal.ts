import { parse as parseJavaScript } from 'acorn';
import { parse as parseHtml } from 'parse5';
import { validateLegacyDb } from './validate.js';
import type { LegacyDb } from '@partsfinder/domain';

interface HtmlNode {
  nodeName?: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  value?: string;
  childNodes?: HtmlNode[];
}

interface JsNode {
  type: string;
  start: number;
  end: number;
  body?: JsNode[];
  declarations?: JsNode[];
  id?: JsNode;
  init?: JsNode | null;
  name?: string;
  kind?: string;
  operator?: string;
  argument?: JsNode;
  elements?: Array<JsNode | null>;
  properties?: JsNode[];
  key?: JsNode;
  value?: unknown;
  computed?: boolean;
  method?: boolean;
  shorthand?: boolean;
  propertyKind?: string;
}

function getText(node: HtmlNode): string {
  if (node.nodeName === '#text') return node.value ?? '';
  return (node.childNodes ?? []).map(getText).join('');
}

function walkHtml(node: HtmlNode, visit: (node: HtmlNode) => void): void {
  visit(node);
  for (const child of node.childNodes ?? []) walkHtml(child, visit);
}

function ensureJsonLiteral(node: JsNode, context: string): void {
  if (node.type === 'Literal') {
    if (node.value === null || typeof node.value === 'string' || typeof node.value === 'boolean') return;
    if (typeof node.value === 'number' && Number.isFinite(node.value)) return;
    throw new TypeError(`${context} contains a non-JSON literal`);
  }
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument?.type === 'Literal' && typeof node.argument.value === 'number' && Number.isFinite(node.argument.value)) return;
  if (node.type === 'ArrayExpression') {
    for (const [index, child] of (node.elements ?? []).entries()) {
      if (!child) throw new TypeError(`${context} contains a sparse array at index ${index}`);
      ensureJsonLiteral(child, `${context}[${index}]`);
    }
    return;
  }
  if (node.type === 'ObjectExpression') {
    const keys = new Set<string>();
    for (const property of node.properties ?? []) {
      if (property.type !== 'Property' || property.kind !== 'init' || property.method || property.computed || property.shorthand) {
        throw new TypeError(`${context} contains a non-JSON object property`);
      }
      const key = property.key;
      if (!key || key.type !== 'Literal' || (typeof key.value !== 'string' && typeof key.value !== 'number')) {
        throw new TypeError(`${context} contains a non-literal object key`);
      }
      const keyText = String(key.value);
      if (keys.has(keyText)) throw new TypeError(`${context} contains duplicate JSON key: ${keyText}`);
      keys.add(keyText);
      if (!property.value || typeof property.value !== 'object' || !('type' in property.value)) {
        throw new TypeError(`${context}.${keyText} is not a JSON value`);
      }
      ensureJsonLiteral(property.value as JsNode, `${context}.${keyText}`);
    }
    return;
  }
  throw new TypeError(`${context} initializer must be a JSON-compatible literal`);
}

function scriptContents(html: string): Array<{ text: string; sourceType: 'script' | 'module' }> {
  const document = parseHtml(html) as unknown as HtmlNode;
  const contents: Array<{ text: string; sourceType: 'script' | 'module' }> = [];
  walkHtml(document, (node) => {
    if (node.tagName !== 'script') return;
    const attrs = new Map((node.attrs ?? []).map((attribute) => [attribute.name.toLowerCase(), attribute.value]));
    if (attrs.has('src')) return;
    const type = (attrs.get('type') ?? '').trim().toLowerCase();
    if (type && type !== 'module' && !/(?:java|ecma)script/.test(type)) return;
    const text = getText(node);
    if (text.trim()) contents.push({ text, sourceType: type === 'module' ? 'module' : 'script' });
  });
  return contents;
}

/** Parses the single top-level const DB initializer as JSON. No application code is evaluated. */
export function extractLegacyDb(html: string): LegacyDb {
  const declarations: Array<{ source: string; node: JsNode }> = [];
  for (const [index, script] of scriptContents(html).entries()) {
    let program: JsNode;
    try {
      program = parseJavaScript(script.text, { ecmaVersion: 'latest', sourceType: script.sourceType, allowHashBang: true }) as unknown as JsNode;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SyntaxError(`Unable to parse inline JavaScript block ${index + 1}: ${message}`);
    }

    for (const statement of program.body ?? []) {
      if (statement.type !== 'VariableDeclaration') continue;
      for (const declaration of statement.declarations ?? []) {
        if (declaration.id?.type === 'Identifier' && declaration.id.name === 'DB') {
          declarations.push({ source: script.text, node: { ...declaration, kind: statement.kind ?? '' } });
        }
      }
    }
  }

  if (declarations.length === 0) throw new Error('No top-level DB declaration found');
  if (declarations.length !== 1) throw new Error(`Duplicate top-level DB declarations found: ${declarations.length}`);
  const declaration = declarations[0];
  if (!declaration) throw new Error('DB declaration could not be read');
  if (declaration.node.kind !== 'const') throw new TypeError('DB must be declared as a top-level const');
  const initializer = declaration.node.init;
  if (!initializer || initializer.type !== 'ObjectExpression') {
    throw new TypeError('DB initializer must be a JSON-compatible object literal');
  }
  ensureJsonLiteral(initializer, 'DB');

  const literalSource = declaration.source.slice(initializer.start, initializer.end);
  let value: unknown;
  try {
    value = JSON.parse(literalSource);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SyntaxError(`DB literal is not valid JSON: ${message}`);
  }
  validateLegacyDb(value);
  return value;
}
