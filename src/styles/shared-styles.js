// Wraps the whole src/styles.css as a Lit `css` result, for Shadow DOM
// game components (see docs/modernization-plan.md Phase 2+) to include
// via `static styles = sharedStyles`.
//
// Deliberately the WHOLE stylesheet, not a hand-picked subset — carving
// out "just what one game needs" risks silently missing a rule (e.g.
// a category color variable) that only shows up as a subtle
// visual bug or a failing test months later. A little unused CSS
// specificity inside a component's shadow root costs nothing at
// runtime; a missed rule costs a real regression.
// Trimming this to a smaller per-component/shared-tokens split is a
// legitimate later optimization (Phase 4) once every game has migrated
// and the full picture of what's actually shared is clear.
//
// `import ... with { type: 'text' }` is a Bun bundler feature (and
// works identically under `bun run dev`'s plain HTTP serving) — it
// gives the file's raw text as a JS string at both bundle- and
// run-time, instead of Bun's default CSS-asset handling. `unsafeCSS`
// is Lit's documented escape hatch for wrapping a string (from a
// trusted local source, not user input) as a CSSResult.
import { css, unsafeCSS } from 'lit';
import rawCss from '../styles.css' with { type: 'text' };

export const sharedStyles = css`${unsafeCSS(rawCss)}`;
