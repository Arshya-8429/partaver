import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse, serialize } from 'parse5';

interface HtmlNode {
  nodeName: string;
  tagName?: string;
  namespaceURI?: string;
  value?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: HtmlNode[];
  parentNode?: HtmlNode;
}

function textContent(node: HtmlNode): string {
  if (node.nodeName === '#text') return node.value ?? '';
  return (node.childNodes ?? []).map(textContent).join('');
}

function visit(node: HtmlNode, callback: (node: HtmlNode) => void): void {
  callback(node);
  for (const child of node.childNodes ?? []) visit(child, callback);
}

function removeNode(node: HtmlNode): void {
  const parent = node.parentNode;
  if (!parent?.childNodes) return;
  const index = parent.childNodes.indexOf(node);
  if (index >= 0) parent.childNodes.splice(index, 1);
}

function classifyRule(rule: string): 'base' | 'components' | 'dark' | 'motion' {
  const opening = rule.indexOf('{');
  const selector = rule.slice(0, opening).trim().toLowerCase();
  const lower = rule.toLowerCase();
  if (selector.startsWith('@keyframes') || selector.startsWith('@-webkit-keyframes') || selector.includes('prefers-reduced-motion')) return 'motion';
  if (selector.startsWith('@media') || selector.startsWith('@supports')) {
    if (lower.includes('body.dark') || lower.includes('.dark ')) return 'dark';
    if (lower.includes('keyframes') || lower.includes('prefers-reduced-motion')) return 'motion';
    return 'components';
  }
  if (selector.includes('body.dark') || selector.includes('.dark')) return 'dark';
  if (/^(?:\*|html|body|html\s*,\s*body|:root)(?:$|,|\s)/.test(selector)) return 'base';
  return 'components';
}

function splitRules(css: string): Record<'base' | 'components' | 'dark' | 'motion', string[]> {
  const result: Record<'base' | 'components' | 'dark' | 'motion', string[]> = { base: [], components: [], dark: [], motion: [] };
  let start = 0;
  let cursor = 0;
  let depth = 0;
  let quote = '';
  let comment = false;
  while (cursor < css.length) {
    const character = css[cursor] ?? '';
    const next = css[cursor + 1] ?? '';
    if (comment) {
      if (character === '*' && next === '/') { comment = false; cursor += 2; continue; }
      cursor++;
      continue;
    }
    if (!quote && character === '/' && next === '*') { comment = true; cursor += 2; continue; }
    if (quote) {
      if (character === '\\') { cursor += 2; continue; }
      if (character === quote) quote = '';
      cursor++;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; cursor++; continue; }
    if (character === '{') depth++;
    else if (character === '}') {
      depth--;
      if (depth === 0) {
        const rule = css.slice(start, cursor + 1);
        result[classifyRule(rule)].push(rule);
        start = cursor + 1;
      }
    }
    cursor++;
  }
  const trailing = css.slice(start).trim();
  if (trailing) result.base.unshift(trailing);
  return result;
}

function element(tagName: string, attrs: Array<{ name: string; value: string }>, parent: HtmlNode): HtmlNode {
  return { nodeName: tagName, tagName, namespaceURI: 'http://www.w3.org/1999/xhtml', attrs, childNodes: [], parentNode: parent };
}

function text(value: string, parent: HtmlNode): HtmlNode {
  return { nodeName: '#text', value, parentNode: parent };
}

function appendText(parent: HtmlNode, tagName: string, attrs: Array<{ name: string; value: string }>, value: string): HtmlNode {
  const child = element(tagName, attrs, parent);
  child.childNodes?.push(text(value, child));
  parent.childNodes?.push(child);
  return child;
}

function attribute(nodeValue: HtmlNode, name: string, value: string): void {
  if (!nodeValue.attrs) nodeValue.attrs = [];
  const existing = nodeValue.attrs.find((item) => item.name === name);
  if (existing) existing.value = value;
  else nodeValue.attrs.push({ name, value });
}

function injectStatusPanel(documentBody: HtmlNode): void {
  let header: HtmlNode | undefined;
  visit(documentBody, (current) => {
    if (current.tagName === 'div' && current.attrs?.some((item) => item.name === 'class' && item.value.split(/\s+/).includes('header'))) header = current;
  });
  const parent = header?.parentNode;
  if (!header || !parent?.childNodes) throw new Error('The original PartsFinder header could not be found.');
  const wrapper = element('section', [{ name: 'class', value: 'catalogueStatus' }, { name: 'aria-label', value: 'وضعیت کاتالوگ آفلاین' }], parent);
  const main = element('div', [{ name: 'class', value: 'catalogueStatusMain' }], wrapper);
  appendText(main, 'span', [{ name: 'class', value: 'statusDot' }, { name: 'aria-hidden', value: 'true' }], '');
  appendText(main, 'span', [{ name: 'id', value: 'catalogueStatusText' }, { name: 'role', value: 'status' }, { name: 'aria-live', value: 'polite' }], 'در حال بررسی داده‌های آفلاین…');
  appendText(main, 'span', [{ name: 'class', value: 'catalogueStatusVersion' }, { name: 'id', value: 'catalogueVersion' }], '');
  wrapper.childNodes?.push(main);
  appendText(wrapper, 'div', [{ name: 'class', value: 'catalogueStatusMeta' }, { name: 'id', value: 'catalogueStatusMeta' }], 'برای استفادهٔ آفلاین، داده‌های کاتالوگ را دریافت کنید.');
  const progress = element('progress', [{ name: 'id', value: 'catalogueProgress' }, { name: 'max', value: '100' }, { name: 'value', value: '0' }, { name: 'hidden', value: '' }, { name: 'aria-label', value: 'پیشرفت دریافت کاتالوگ' }], wrapper);
  wrapper.childNodes?.push(progress);
  const actions = element('div', [{ name: 'class', value: 'catalogueStatusActions' }], wrapper);
  appendText(actions, 'button', [{ name: 'class', value: 'catalogueUpdateButton' }, { name: 'id', value: 'catalogueUpdateButton' }, { name: 'type', value: 'button' }], 'دریافت / بررسی به‌روزرسانی');
  appendText(actions, 'button', [{ name: 'class', value: 'catalogueCancelButton' }, { name: 'id', value: 'catalogueCancelButton' }, { name: 'type', value: 'button' }, { name: 'hidden', value: '' }], 'لغو');
  wrapper.childNodes?.push(actions);
  const headerIndex = parent.childNodes.indexOf(header);
  parent.childNodes.splice(headerIndex + 1, 0, wrapper);

  const input = documentBody.childNodes?.length ? (() => {
    let result: HtmlNode | undefined;
    visit(documentBody, (current) => { if (current.tagName === 'input' && current.attrs?.some((item) => item.name === 'id' && item.value === 'vehicle')) result = current; });
    return result;
  })() : undefined;
  if (input) {
    attribute(input, 'role', 'combobox');
    attribute(input, 'aria-haspopup', 'listbox');
  }
  let tabs: HtmlNode | undefined;
  visit(documentBody, (current) => { if (current.tagName === 'div' && current.attrs?.some((item) => item.name === 'class' && item.value.split(/\s+/).includes('tabs'))) tabs = current; });
  if (tabs) attribute(tabs, 'role', 'tablist');
  for (const panelId of ['partMode', 'codeMode'] as const) {
    let tab: HtmlNode | undefined;
    visit(documentBody, (current) => {
      if (current.tagName === 'button' && current.attrs?.some((item) => item.name === 'data-mode' && item.value === panelId)) tab = current;
    });
    if (tab) {
      attribute(tab, 'role', 'tab');
      attribute(tab, 'aria-controls', panelId);
      attribute(tab, 'aria-selected', panelId === 'partMode' ? 'true' : 'false');
    }
  }
  visit(documentBody, (current) => {
    if (current.tagName === 'div' && current.attrs?.some((item) => item.name === 'id' && item.value === 'message')) {
      attribute(current, 'role', 'status');
      attribute(current, 'aria-live', 'polite');
      attribute(current, 'aria-atomic', 'true');
    }
    if (current.tagName === 'div' && current.attrs?.some((item) => item.name === 'id' && item.value === 'cards')) {
      attribute(current, 'aria-live', 'polite');
      attribute(current, 'aria-relevant', 'additions text');
    }
    if (current.tagName === 'input' && current.attrs?.some((item) => item.name === 'id' && item.value === 'partQuery')) attribute(current, 'aria-controls', 'partList');
    if (current.tagName === 'input' && current.attrs?.some((item) => item.name === 'id' && item.value === 'codeQuery')) attribute(current, 'dir', 'auto');
  });
}

async function main(): Promise<void> {
  const sourcePath = resolve(process.argv[2] ?? 'PartsFinder_Android-28 (1) (1).html');
  const outputDirectory = resolve(process.argv[3] ?? 'apps/web');
  const source = await readFile(sourcePath, 'utf8');
  const document = parse(source) as unknown as HtmlNode;
  const styles: string[] = [];
  let head: HtmlNode | undefined;
  let body: HtmlNode | undefined;
  visit(document, (current) => {
    if (current.tagName === 'head') head = current;
    if (current.tagName === 'body') body = current;
    if (current.tagName === 'style') {
      styles.push(textContent(current));
      removeNode(current);
    } else if (current.tagName === 'script') removeNode(current);
  });
  if (!head || !body) throw new Error('The original HTML has no document head or body.');

  const cssFiles: Record<'base' | 'components' | 'dark' | 'motion', string[]> = { base: [], components: [], dark: [], motion: [] };
  for (const sheet of styles) {
    const parts = splitRules(sheet);
    for (const [kind, rules] of Object.entries(parts) as Array<[keyof typeof cssFiles, string[]]>) cssFiles[kind].push(...rules);
  }
  const stylesDirectory = resolve(outputDirectory, 'src/styles');
  await mkdir(stylesDirectory, { recursive: true });
  for (const kind of ['base', 'components', 'dark', 'motion'] as const) {
    await writeFile(resolve(stylesDirectory, `${kind}.css`), `${cssFiles[kind].join('\n')}\n`, 'utf8');
  }

  const viewport = (head.childNodes ?? []).find((current) => current.tagName === 'meta' && current.attrs?.some((attribute) => attribute.name === 'name' && attribute.value === 'viewport'));
  if (viewport?.attrs) viewport.attrs = viewport.attrs.map((attribute) => attribute.name === 'content'
    ? { ...attribute, value: attribute.value.replace(/,?maximum-scale\s*=\s*[^,]+/i, '') }
    : attribute);
  for (const href of ['/src/styles/base.css', '/src/styles/components.css', '/src/styles/motion.css', '/src/styles/dark.css']) {
    // Link elements are inserted in source stylesheet order to retain the existing cascade.
    head.childNodes?.push(element('link', [{ name: 'rel', value: 'stylesheet' }, { name: 'href', value: href }], head));
  }
  head.childNodes?.push(element('link', [{ name: 'rel', value: 'manifest' }, { name: 'href', value: '/manifest.webmanifest' }], head));
  injectStatusPanel(body);
  body.childNodes?.push(element('script', [{ name: 'type', value: 'module' }, { name: 'src', value: '/src/main.ts' }], body));

  const html = serialize(document as never);
  const outputPath = resolve(outputDirectory, 'index.html');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  process.stdout.write(`${JSON.stringify({ sourceBytes: Buffer.byteLength(source), outputPath, styles: Object.fromEntries(Object.entries(cssFiles).map(([key, value]) => [key, value.join('\n').length])), scriptsRemoved: 2 })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
