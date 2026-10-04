/** What every template may use besides its message: where links point. */
export interface RenderContext {
  /** NetNet's origin, such as `https://‹domain›` (see `publicOrigin()`). */
  origin: string;
}
