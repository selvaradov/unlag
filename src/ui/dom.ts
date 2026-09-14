// Keep drawing nodes attached so an ongoing touch keeps its original event target.
export function updateElement(current: Element, next: Element): void {
  if (current.isEqualNode(next)) return;
  for (const attribute of [...current.attributes]) {
    if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
  }
  for (const attribute of next.attributes) {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  }
  if (!next.children.length && !current.children.length) {
    if (current.textContent !== next.textContent) current.textContent = next.textContent;
    return;
  }
  const keyed = new Map<string, Element>();
  const unkeyed: Element[] = [];
  for (const child of current.children) {
    const key = child.getAttribute('data-key');
    if (key) keyed.set(key, child);
    else unkeyed.push(child);
  }
  const used = new Set<Element>();
  let position = 0;
  let reference = current.firstChild;
  for (const child of next.children) {
    const key = child.getAttribute('data-key');
    const previous = key ? keyed.get(key) : unkeyed[position++];
    if (previous && previous.localName === child.localName) {
      updateElement(previous, child);
      used.add(previous);
      reference = previous.nextSibling;
    } else {
      const added = child.cloneNode(true) as Element;
      current.insertBefore(added, reference);
      used.add(added);
    }
  }
  for (const child of current.children) {
    const style = (child as HTMLElement | SVGElement).style;
    if (!used.has(child) && style.display !== 'none') style.display = 'none';
  }
}
