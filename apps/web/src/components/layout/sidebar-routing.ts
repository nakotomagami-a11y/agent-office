/** Active-route check: treats `/runs` as active for `/runs/*`. */
export function isActiveRoute(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
