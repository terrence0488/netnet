/** What every template may use besides its message: where links point. */
export interface RenderContext {
  /** NetNet's origin, such as `https://‹domain›` (see `publicOrigin()`). */
  origin: string;
  /**
   * The signed `?r=` token, present only for `reminder.comeback`: `notify()` mints it once the
   * channel is chosen, because the token names the channel.
   */
  token?: string | undefined;
}
