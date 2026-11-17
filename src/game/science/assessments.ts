// Knowledge checks (curriculum Phase 1, C9): one short question in context, never a long quiz.
// Every option explains itself, right or wrong, so a wrong answer still teaches; the player can try again.

export interface AssessmentOption {
  id: string;
  text: string;
  correct?: boolean;
  /** Why this answer is right or wrong (one sentence). */
  why: string;
}

export interface Assessment {
  question: string;
  options: AssessmentOption[];
}
