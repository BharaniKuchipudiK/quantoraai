/**
 * Why did the durable store reject the write?
 *
 * THE GAP. `api/_lib/qir-run-store.ts` had the answer and threw it away:
 *
 *     console.warn(`QIR commit event -> ${response.status}`, detail);
 *     return { status: "unavailable" };
 *
 * Supabase's own error text went to a server log nobody reads, and the union
 * type carried no field to put it in. Every layer above then guessed: the route
 * answered a bare `reason: "persist-failed"`, and the desk chip could say only
 * "storage is configured but rejected the last write" — true, and not enough to
 * act on. Missing table, blocked policy and stale key are three different jobs
 * for three different people, and the chip sent all of them looking in the same
 * empty place.
 *
 * This is the unifying shape of nearly every defect in this repo's history: the
 * information existed, a boundary did not carry it, the next layer guessed.
 *
 * WHY CLASSIFY HERE RATHER THAN FORWARD THE TEXT.
 *
 * The chip renders in the user's browser. A raw PostgREST error names tables,
 * columns and sometimes the project, and on a multi-tenant desk that reaches
 * people who are not the operator. So this runs SERVER-SIDE and emits only
 * fixed strings chosen from the list below — the raw text never crosses the
 * wire at all. That is a property, not a promise, and the test asserts it: no
 * substring of the input may appear in the output.
 *
 * PRECISION, PER §5. A chip that fires on ambiguous evidence is one the next
 * person hides. Each branch below keys on an unambiguous signal — a Postgres
 * SQLSTATE or a PostgREST code — and when none matches, this reports only the
 * HTTP status, which is a fact, and no cause at all.
 */

/** Fixed, user-safe verdicts. Nothing here is derived from the store's reply. */
export const QIR_PERSIST_CAUSES = {
  MISSING_TABLE: {
    cause: 'the durable Run tables are not present in this Supabase project',
    remedy: 'apply the QIR migration to the project this deployment points at',
  },
  BLOCKED_BY_POLICY: {
    cause: 'a row-level security policy is refusing the service role',
    remedy: 'grant the service role write access to the QIR tables, or exempt them from RLS',
  },
  REJECTED_KEY: {
    cause: 'the project rejected the service key',
    remedy: 'check SUPABASE_SERVICE_ROLE_KEY belongs to the project in SUPABASE_URL and has not been rotated',
  },
  SCHEMA_DRIFT: {
    cause: 'the tables exist but do not have the columns this build writes',
    remedy: 'apply the latest QIR migration — the schema is behind the code',
  },
  STORE_UNHEALTHY: {
    cause: 'the Supabase project itself returned an error',
    remedy: 'check the project is running and not paused, then retry',
  },
};

/*
 * ORDER IS LOAD-BEARING, and the first draft got it wrong.
 *
 * Postgres words a missing column as "column x of relation y does not exist",
 * which also satisfies the missing-TABLE pattern "relation .* does not exist".
 * With the table branch first, a schema-drift error was diagnosed as an unapplied
 * migration and would have sent someone to re-run a migration that had already
 * run. Caught by reading this function's output rather than its exit code (§8).
 *
 * The column signatures are strictly more specific, so they are tested first.
 * A genuine missing-table error names no column and still falls through to it.
 */
const SIGNATURES = [
  // PGRST204: column absent from the schema cache. 42703: undefined_column.
  { verdict: QIR_PERSIST_CAUSES.SCHEMA_DRIFT, test: /\bPGRST204\b|\b42703\b|column .* does not exist/i },
  // PGRST205: table absent from the schema cache. 42P01: relation missing.
  { verdict: QIR_PERSIST_CAUSES.MISSING_TABLE, test: /\bPGRST205\b|\b42P01\b|could not find the table|relation .* does not exist/i },
  // 42501 is Postgres' insufficient_privilege, which is what RLS raises.
  { verdict: QIR_PERSIST_CAUSES.BLOCKED_BY_POLICY, test: /\b42501\b|row-level security|violates row.level security/i },
  { verdict: QIR_PERSIST_CAUSES.REJECTED_KEY, test: /invalid api key|\bJWT\b|jwt (expired|malformed|invalid)|no api key|invalid authentication/i },
];

/**
 * @param {{ httpStatus?: number, detail?: string }} input the store's reply
 * @returns {{ cause: string, remedy: string }|null}
 *   null means "nothing certain to add" — the chip keeps its generic wording.
 */
export function diagnoseQirPersistFailure({ httpStatus = 0, detail = '' } = {}) {
  const text = typeof detail === 'string' ? detail : '';
  const status = Number(httpStatus) || 0;

  for (const { verdict, test } of SIGNATURES) {
    if (test.test(text)) return { ...verdict };
  }

  /*
   * Status alone is weaker evidence than a SQLSTATE, so it only speaks where it
   * is unambiguous. A 401/403 with no recognisable body is still certainly an
   * auth refusal; a 5xx is certainly the project's own fault. A 400 or 409 is
   * not certainly anything, so it gets nothing.
   */
  if (status === 401 || status === 403) return { ...QIR_PERSIST_CAUSES.REJECTED_KEY };
  if (status >= 500 && status <= 599) return { ...QIR_PERSIST_CAUSES.STORE_UNHEALTHY };

  return null;
}

/**
 * The one line the desk shows under "Run · not saved".
 *
 * @param {{ cause: string, remedy: string }|null} diagnosis
 * @returns {string} '' when there is nothing certain to say
 */
export function describeQirPersistDiagnosis(diagnosis) {
  if (!diagnosis || !diagnosis.cause) return '';
  const remedy = diagnosis.remedy ? ` To fix it, ${diagnosis.remedy}.` : '';
  return `Most likely ${diagnosis.cause}.${remedy}`;
}
