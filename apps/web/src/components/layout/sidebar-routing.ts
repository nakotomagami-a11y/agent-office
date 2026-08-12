/**
 * Active-route check. By default treats `/runs` as active for `/runs/*`. Pass
 * `exact: true` for top-level "office" matches.
 */
export function isActiveRoute(
  pathname: string | null,
  href: string,
  opts: { exact?: boolean } = {},
): boolean {
  if (!pathname) return false;
  if (opts.exact) return pathname === href;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
