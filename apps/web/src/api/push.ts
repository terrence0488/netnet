/**
 * This device's push subscription, as sign-out leaves it: revoked on the server
 * (`DELETE /api/notifications/endpoints/:id?by=signout`), so the comeback reminder never follows
 * the person after they leave. P3-T6 wires the endpoint id and the call; until then this does
 * nothing. Best-effort either way: signing out continues whatever happens here.
 */
export function revokePushOnSignOut(): Promise<void> {
  // P3-T6: revoke this device's notification endpoint here.
  return Promise.resolve();
}
