/* Cleans an HTML block received from the game window before it goes into the projector's DOM.
   The sender is our own code, so this is a second lock, not the first: nothing that can run or
   navigate gets through, whatever the message says. Parsed in an inert <template>, so nothing
   fires while it is being checked. */
const DROP_TAGS =
  'script, style, iframe, object, embed, link, meta, base, form, input, button, textarea, select, a, audio, video, img, image, foreignObject';

export function sanitizeHtml(html, doc = document) {
  const template = doc.createElement('template');
  template.innerHTML = html;
  const root = template.content;
  for (const el of root.querySelectorAll(DROP_TAGS)) el.remove();
  for (const el of root.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on') || name === 'href' || name === 'xlink:href' || name === 'src') {
        el.removeAttribute(attr.name);
      }
    }
  }
  return template.innerHTML;
}
