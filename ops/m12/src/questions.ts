import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { m12QuestionsSchema, type M12Questions } from '@netnet/contracts';
import { QUESTION_SET_FILE } from './config';
import { REPO_ROOT } from './household';

/**
 * The fixed question set (`content/demo/m12-questions.json`, PRD M12): about thirty questions
 * with the ground truth `core` computes and the qualifications a good answer makes. It is
 * committed before the first paid run and carries a version; a change after a run is a new
 * version and every report names it. `content:check` validates the same file, so a set that
 * loads here is one CI has checked.
 */

/** The question set from `content/`, or an error naming the first thing wrong with it. */
export function readQuestions(root: string = REPO_ROOT): M12Questions {
  const path = resolve(root, QUESTION_SET_FILE);
  let body: unknown;
  try {
    body = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`The question set at ${QUESTION_SET_FILE} cannot be read: ${reason}`, {
      cause: error,
    });
  }
  const parsed = m12QuestionsSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const at = first === undefined || first.path.length === 0 ? '' : ` at ${first.path.join('.')}`;
    throw new Error(
      `The question set at ${QUESTION_SET_FILE} is not valid${at}: ${first?.message ?? 'unknown'}`,
    );
  }
  return parsed.data;
}

/** The set's version, as every report and `scores.json` names it. */
export function questionSetVersion(set: Pick<M12Questions, 'version'>): number {
  return set.version;
}
