/** Minimal strict XML parser for tests: throws on anything that is not well-formed. */
export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}
const decode = (text: string) =>
  text.replace(
    /&(amp|lt|gt|quot|apos);/g,
    (_m, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[e]!,
  );

export function parseXml(xml: string): XmlNode {
  const body = xml.replace(/^<\?xml[^>]*\?>\s*/, '');
  const root: XmlNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const token = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g;
  for (let m = token.exec(body); m; m = token.exec(body)) {
    const [, closing, name, attrText, selfClosing, text, stray] = m;
    if (stray) throw new Error(`Stray "<" at ${m.index}`);
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      if (/[<>]/.test(text) || /&(?!(amp|lt|gt|quot|apos);)/.test(text))
        throw new Error(`Unescaped text: ${text.slice(0, 40)}`);
      top.text += decode(text);
    } else if (closing) {
      if (top.name !== name) throw new Error(`Mismatched </${name}>, expected </${top.name}>`);
      stack.pop();
    } else {
      const attrs: Record<string, string> = {};
      for (const a of attrText.matchAll(/([\w:.-]+)="([^"]*)"/g)) attrs[a[1]] = decode(a[2]);
      const node: XmlNode = { name, attrs, children: [], text: '' };
      top.children.push(node);
      if (!selfClosing) stack.push(node);
    }
  }
  if (stack.length !== 1) throw new Error(`Unclosed <${stack[stack.length - 1].name}>`);
  if (root.children.length !== 1) throw new Error('Expected exactly one root element');
  return root.children[0];
}
export const kids = (node: XmlNode, name: string) => node.children.filter((c) => c.name === name);
export const child = (node: XmlNode, name: string) => kids(node, name)[0];
export const textOf = (node: XmlNode, name: string) => child(node, name)?.text ?? '';
export function all(node: XmlNode, name: string): XmlNode[] {
  return [...(node.name === name ? [node] : []), ...node.children.flatMap((c) => all(c, name))];
}
/** Paise from a Tally amount string such as "-1180.00". */
export const toPaise = (value: string) => Math.round(Number(value) * 100);
