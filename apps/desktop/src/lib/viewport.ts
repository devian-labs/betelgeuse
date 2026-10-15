/**
 * The bottom edge of what can be seen. On a phone that's the top of the on-screen keyboard: on iOS
 * the window doesn't shrink for it, so `innerHeight` would put menus behind it. Elsewhere it's the
 * window's height.
 */
export function visibleBottom(): number {
  const vv = window.visualViewport;
  return vv ? vv.offsetTop + vv.height : window.innerHeight;
}
