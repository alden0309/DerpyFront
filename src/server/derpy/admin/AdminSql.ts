// ADMIN (r26): the SQL that says who the owner is and who is suspended,
// shared by sign-in (DerpyAuth) and the admin page. No imports, so anything
// may use it.

/** based_granted_as on the owner's account: the owner's own name, marked once (BasedAccess.ts). */
export const OWNER_MARK = "alden";

/** SQL: whether account `a` is suspended now (suspended_until null: until lifted). */
export const SUSPENDED_SQL = (a: string): string =>
  `(${a}.suspended_at IS NOT NULL AND (${a}.suspended_until IS NULL OR ${a}.suspended_until > now()))`;

/** SQL: whether account `a` is the owner's. */
export const OWNER_SQL = (a: string): string =>
  `(${a}.based_access AND ${a}.based_granted_as = '${OWNER_MARK}')`;
