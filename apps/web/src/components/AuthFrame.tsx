import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cx } from './cx';
import { Wordmark } from './Wordmark';
import styles from './AuthFrame.module.css';

export interface AuthFrameProps {
  readonly title: string;
  /** One line under the title, such as who a password is for. */
  readonly sub?: ReactNode | undefined;
  /** Where Back goes, when the screen has a step before it. */
  readonly back?: { readonly to: string; readonly state?: unknown } | undefined;
  /** Where a screen sits in a short run of questions: "1 of 2". */
  readonly step?: string | undefined;
  /** A quiet line above everything else, such as the unverified notice. */
  readonly notice?: ReactNode | undefined;
  /** The title's id, for a group of answers the title names. */
  readonly titleId?: string | undefined;
  readonly children?: ReactNode;
}

/**
 * The frame of the screens without chrome before Home: sign-up, log-in, the password screens and
 * onboarding (design-system §7). The wordmark, then Back when there is a step before, then one
 * question or task per screen.
 */
export function AuthFrame({ title, sub, back, step, notice, titleId, children }: AuthFrameProps) {
  const generated = useId();
  const headingId = titleId ?? generated;
  return (
    <section className={styles.frame} aria-labelledby={headingId}>
      <div className={styles.mark}>
        <Wordmark />
      </div>
      {notice ? <div className={styles.notice}>{notice}</div> : null}
      {back ? (
        <Link to={back.to} state={back.state} className={styles.back}>
          <span aria-hidden="true">‹</span> Back
        </Link>
      ) : null}
      {step ? <p className={styles.step}>{step}</p> : null}
      <h1 id={headingId} className={styles.title}>
        {title}
      </h1>
      {sub ? <p className={styles.sub}>{sub}</p> : null}
      {children}
    </section>
  );
}

/** A form's fields and its action, spaced as one column. */
export function AuthForm({
  onSubmit,
  labelledBy,
  children,
}: {
  readonly onSubmit: () => void;
  /** The id of what names the form, usually the screen's title. */
  readonly labelledBy?: string;
  readonly children: ReactNode;
}) {
  return (
    <form
      className={styles.form}
      noValidate
      aria-labelledby={labelledBy}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** What went wrong with the whole form (not one field), and what to do about it. */
export function FormProblem({ children }: { readonly children: ReactNode }) {
  return (
    <p className={styles.problem} role="alert">
      {children}
    </p>
  );
}

/** A quiet line: a hint, or the result of a small action. */
export function Hint({
  children,
  live = false,
  className,
}: {
  readonly children: ReactNode;
  /** Read out when it changes, as the result of an action is. */
  readonly live?: boolean;
  readonly className?: string;
}) {
  return (
    <p className={cx(styles.hint, className)} aria-live={live ? 'polite' : undefined}>
      {children}
    </p>
  );
}

/** The ways on from the screen: log in instead, create an account, forgot password. */
export function AuthFoot({ children }: { readonly children: ReactNode }) {
  return <div className={styles.foot}>{children}</div>;
}

export { styles as authStyles };
