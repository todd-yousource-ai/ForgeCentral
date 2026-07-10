import { componentStyles, tokensToCss } from '@forge/design';

// The Console renders the @forge/design system: the token `:root` block (the dark theme) plus the
// component stylesheet. Both are injected once at the app root as a single <style> element. There are no
// hand-picked colors here; every value is a `--fc-*` token (INV-CONSOLE-DESIGN-SEMANTIC-COLOR). The shell
// layout stylesheet (shell.css) also binds only to those tokens.

const STYLE_ELEMENT_ID = 'forge-console-theme';

/** The full stylesheet string: the token variables followed by the component rules. */
export function themeStylesheet(): string {
  return `${tokensToCss()}\n${componentStyles()}`;
}

/** Inject the theme once into the document head (idempotent). Safe to call on every mount. */
export function installTheme(doc: Document = document): void {
  if (doc.getElementById(STYLE_ELEMENT_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = themeStylesheet();
  doc.head.appendChild(style);
}
