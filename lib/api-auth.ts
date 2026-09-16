import { timingSafeEqual } from "node:crypto";

/**
 * Godkendelse af endpoints der kaldes af maskiner.
 *
 * Make, GatewayAPI og cron-kaldet har ingen brugersession at vise frem, så de
 * viser en delt hemmelighed i stedet. Lå sammenligningen i hver rute for sig,
 * ville en af dem før eller siden blive skrevet med == og lække hemmeligheden
 * gennem svartiden.
 */

/** Sammenligner uden at lække længde eller position via svartid. */
export function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Henter den delte hemmelighed fra kaldet.
 *
 * Authorization: Bearer <hemmelighed> er det normale. GatewayAPI kan ikke
 * sætte headers på sin webhook, så den får lov at lægge den i ?token=.
 */
export function tokenFromRequest(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Bearer ")) return header.slice(7);

  const query = new URL(request.url).searchParams.get("token");
  return query ?? "";
}

/** True hvis kaldet viser den rigtige hemmelighed. */
export function authorized(request: Request, expected: string | undefined): boolean {
  if (!expected) return false;
  const token = tokenFromRequest(request);
  return token.length > 0 && secretMatches(token, expected);
}
