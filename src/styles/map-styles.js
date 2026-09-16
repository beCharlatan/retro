// Same wrapper pattern as ./shared-styles.js — `with { type: 'text' }`
// gives the raw CSS text at bundle- and run-time, `unsafeCSS` wraps it
// as a Lit CSSResult. Deliberately a SEPARATE file from shared-styles.js
// (not a merge/extend): this is the gamified map screen's own visual
// system, not meant to be reused by the 13 kit-precise game screens —
// see src/styles/map-styles.css's header comment.
import { css, unsafeCSS } from 'lit';
import rawCss from './map-styles.css' with { type: 'text' };

export const mapStyles = css`${unsafeCSS(rawCss)}`;
