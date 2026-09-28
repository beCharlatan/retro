/* The one ProjectorLink of this page (game window side). */
import { ProjectorLink } from './link.js';

export const PROJECTOR_QUERY = 'view=projector';

export function projectorUrl(href = window.location.href) {
  const url = new URL(href);
  url.search = `?${PROJECTOR_QUERY}`;
  url.hash = '';
  return url.toString();
}

export const isProjectorView = () =>
  new URLSearchParams(window.location.search).get('view') === 'projector';

export const projector = new ProjectorLink({
  self: window,
  open: (...args) => window.open(...args),
  url: projectorUrl(),
});

// Nothing tells us when the popup is closed; look now and then so the button can say so.
setInterval(() => projector.check(), 1500);
