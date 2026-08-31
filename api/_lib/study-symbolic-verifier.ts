import { createHash } from "node:crypto";
import type { StudyVerificationCheck } from "./study-verification.js";

export const STUDY_SYMBOLIC_VERIFIER_VERSION = "study-symbolic-verifier-2026-08-31.2";

export type StudySymbolicDomain = "real" | "complex";
export type StudySymbolicRelation = "expression" | "equation";

export type StudySymbolicAssumptions = {
  /** Expressions explicitly assumed non-zero for domain preservation. */
  nonZeroExpressions?: string[] | null;
};

export type StudySymbolicVerificationRequest = {
  claimId: string;
  actual: string;
  expected: string;
  relation: StudySymbolicRelation;
  domain: StudySymbolicDomain;
  /** Every symbol used by either side must be declared explicitly. */
  variables: string[];
  assumptions?: StudySymbolicAssumptions | null;
};

export type StudySymbolicVerificationTrace = {
  version: string;
  claimId: string;
  relation: StudySymbolicRelation;
  domain: StudySymbolicDomain;
  variables: string[];
  actualCanonical: string;
  expectedCanonical: string;
  actualDomainConstraints: string[];
  expectedDomainConstraints: string[];
  nonZeroAssumptions: string[];
  decision: "verified" | "rejected";
  reasonCode: string;
};

export type StudySymbolicVerificationResult = {
  check: StudyVerificationCheck;
  trace: StudySymbolicVerificationTrace | null;
};

type Fraction = { n: bigint; d: bigint };
type Polynomial = Map<string, Fraction>;
type RationalExpression = {
  numerator: Polynomial;
  denominator: Polynomial;
  constraints: Set<string>;
};
type Operator = "+" | "-" | "*" | "/" | "^" | "(" | ")";
type Token =
  | { kind: "number"; value: string }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: Operator };

const MAX_EXPRESSION_LENGTH = 500;
const MAX_TOKENS = 240;
const MAX_VARIABLES = 12;
const MAX_EXPONENT = 8;
const MAX_POLYNOMIAL_TERMS = 600;

class SymbolicError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1n;
}

function fraction(n: bigint, d = 1n): Fraction {
  if (d === 0n) throw new SymbolicError("symbolic_division_by_zero");
  if (n === 0n) return { n: 0n, d: 1n };
  const sign = d < 0n ? -1n : 1n;
  const g = gcd(n, d);
  return { n: (n / g) * sign, d: (d / g) * sign };
}

function fAdd(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d + b.n * a.d, a.d * b.d);
}

function fSub(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d - b.n * a.d, a.d * b.d);
}

function fMul(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.n, a.d * b.d);
}

function fDiv(a: Fraction, b: Fraction): Fraction {
  return fraction(a.n * b.d, a.d * b.n);
}

function fEqual(a: Fraction, b: Fraction): boolean {
  return a.n === b.n && a.d === b.d;
}

function fText(a: Fraction): string {
  return a.d === 1n ? a.n.toString() : `${a.n}/${a.d}`;
}

function pow10(exp: number): bigint {
  if (!Number.isInteger(exp) || exp < 0 || exp > 40) {
    throw new SymbolicError("symbolic_number_out_of_range");
  }
  return 10n ** BigInt(exp);
}

function parseExactNumber(raw: string): Fraction {
  const match = raw.match(/^((?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new SymbolicError("symbolic_invalid_number");
  const exponent = Number(match[2] || "0");
  if (!Number.isInteger(exponent) || Math.abs(exponent) > 20) {
    throw new SymbolicError("symbolic_number_out_of_range");
  }
  const [whole, decimal = ""] = match[1].split(".");
  const digits = `${whole || "0"}${decimal}`;
  let numerator = BigInt(digits || "0");
  let denominator = pow10(decimal.length);
  if (exponent > 0) numerator *= pow10(exponent);
  if (exponent < 0) denominator *= pow10(-exponent);
  return fraction(numerator, denominator);
}

function clonePolynomial(poly: Polynomial): Polynomial {
  return new Map([...poly.entries()].map(([key, value]) => [key, { ...value }]));
}

function constantPolynomial(value: Fraction): Polynomial {
  return value.n === 0n ? new Map() : new Map([["", value]]);
}

function variablePolynomial(name: string): Polynomial {
  return new Map([[`${name}^1`, fraction(1n)]]);
}

function polynomialIsZero(poly: Polynomial): boolean {
  return poly.size === 0;
}

function polynomialIsConstant(poly: Polynomial): boolean {
  return poly.size === 0 || (poly.size === 1 && poly.has(""));
}

function parseMonomial(key: string): Map<string, number> {
  const result = new Map<string, number>();
  if (!key) return result;
  for (const part of key.split("*")) {
    const match = part.match(/^([A-Za-z][A-Za-z0-9_]*)\^(\d+)$/);
    if (!match) throw new SymbolicError("symbolic_internal_monomial_error");
    result.set(match[1], Number(match[2]));
  }
  return result;
}

function monomialKey(parts: Map<string, number>): string {
  return [...parts.entries()]
    .filter(([, exponent]) => exponent > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, exponent]) => `${name}^${exponent}`)
    .join("*");
}

function multiplyMonomials(a: string, b: string): string {
  const parts = parseMonomial(a);
  for (const [name, exponent] of parseMonomial(b)) {
    parts.set(name, (parts.get(name) || 0) + exponent);
  }
  return monomialKey(parts);
}

function setCoefficient(poly: Polynomial, key: string, value: Fraction) {
  if (value.n === 0n) poly.delete(key);
  else poly.set(key, value);
  if (poly.size > MAX_POLYNOMIAL_TERMS) throw new SymbolicError("symbolic_complexity_limit");
}

function polynomialAdd(a: Polynomial, b: Polynomial): Polynomial {
  const result = clonePolynomial(a);
  for (const [key, value] of b) {
    setCoefficient(result, key, fAdd(result.get(key) || fraction(0n), value));
  }
  return result;
}

function polynomialSubtract(a: Polynomial, b: Polynomial): Polynomial {
  const result = clonePolynomial(a);
  for (const [key, value] of b) {
    setCoefficient(result, key, fSub(result.get(key) || fraction(0n), value));
  }
  return result;
}

function polynomialScale(poly: Polynomial, scalar: Fraction): Polynomial {
  if (scalar.n === 0n) return new Map();
  const result: Polynomial = new Map();
  for (const [key, value] of poly) setCoefficient(result, key, fMul(value, scalar));
  return result;
}

function polynomialMultiply(a: Polynomial, b: Polynomial): Polynomial {
  if (polynomialIsZero(a) || polynomialIsZero(b)) return new Map();
  const result: Polynomial = new Map();
  for (const [aKey, aValue] of a) {
    for (const [bKey, bValue] of b) {
      const key = multiplyMonomials(aKey, bKey);
      setCoefficient(result, key, fAdd(result.get(key) || fraction(0n), fMul(aValue, bValue)));
    }
  }
  return result;
}

function polynomialPower(poly: Polynomial, exponent: number): Polynomial {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_EXPONENT) {
    throw new SymbolicError("symbolic_exponent_unsupported");
  }
  if (exponent === 0) {
    if (polynomialIsZero(poly)) throw new SymbolicError("symbolic_zero_to_zero_power");
    return constantPolynomial(fraction(1n));
  }
  let result = constantPolynomial(fraction(1n));
  let base = clonePolynomial(poly);
  let power = exponent;
  while (power > 0) {
    if (power % 2 === 1) result = polynomialMultiply(result, base);
    power = Math.floor(power / 2);
    if (power > 0) base = polynomialMultiply(base, base);
  }
  return result;
}

function polynomialEqual(a: Polynomial, b: Polynomial): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    const other = b.get(key);
    if (!other || !fEqual(value, other)) return false;
  }
  return true;
}

function sortedPolynomialEntries(poly: Polynomial): Array<[string, Fraction]> {
  return [...poly.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function polynomialCanonical(poly: Polynomial): string {
  if (polynomialIsZero(poly)) return "0";
  return sortedPolynomialEntries(poly)
    .map(([key, value]) => `${fText(value)}:${key || "1"}`)
    .join("|");
}

/** Canonicalizes a zero-set up to multiplication by a non-zero scalar. */
function polynomialZeroSetCanonical(poly: Polynomial): string {
  if (polynomialIsZero(poly)) return "0";
  const entries = sortedPolynomialEntries(poly);
  const leading = entries[0][1];
  return polynomialCanonical(polynomialScale(poly, fDiv(fraction(1n), leading)));
}

function rationalConstant(value: Fraction): RationalExpression {
  return {
    numerator: constantPolynomial(value),
    denominator: constantPolynomial(fraction(1n)),
    constraints: new Set(),
  };
}

function rationalVariable(name: string): RationalExpression {
  return {
    numerator: variablePolynomial(name),
    denominator: constantPolynomial(fraction(1n)),
    constraints: new Set(),
  };
}

function mergeConstraints(...groups: Set<string>[]): Set<string> {
  return new Set(groups.flatMap((group) => [...group]));
}

function rationalAdd(a: RationalExpression, b: RationalExpression): RationalExpression {
  return {
    numerator: polynomialAdd(
      polynomialMultiply(a.numerator, b.denominator),
      polynomialMultiply(b.numerator, a.denominator),
    ),
    denominator: polynomialMultiply(a.denominator, b.denominator),
    constraints: mergeConstraints(a.constraints, b.constraints),
  };
}

function rationalSubtract(a: RationalExpression, b: RationalExpression): RationalExpression {
  return {
    numerator: polynomialSubtract(
      polynomialMultiply(a.numerator, b.denominator),
      polynomialMultiply(b.numerator, a.denominator),
    ),
    denominator: polynomialMultiply(a.denominator, b.denominator),
    constraints: mergeConstraints(a.constraints, b.constraints),
  };
}

function rationalMultiply(a: RationalExpression, b: RationalExpression): RationalExpression {
  return {
    numerator: polynomialMultiply(a.numerator, b.numerator),
    denominator: polynomialMultiply(a.denominator, b.denominator),
    constraints: mergeConstraints(a.constraints, b.constraints),
  };
}

function rationalDivide(a: RationalExpression, b: RationalExpression): RationalExpression {
  if (polynomialIsZero(b.numerator)) throw new SymbolicError("symbolic_division_by_zero_expression");
  const constraints = mergeConstraints(a.constraints, b.constraints);
  if (!polynomialIsConstant(b.numerator)) constraints.add(polynomialZeroSetCanonical(b.numerator));
  return {
    numerator: polynomialMultiply(a.numerator, b.denominator),
    denominator: polynomialMultiply(a.denominator, b.numerator),
    constraints,
  };
}

function rationalNegate(value: RationalExpression): RationalExpression {
  return {
    numerator: polynomialScale(value.numerator, fraction(-1n)),
    denominator: clonePolynomial(value.denominator),
    constraints: new Set(value.constraints),
  };
}

function rationalPower(value: RationalExpression, exponent: number): RationalExpression {
  return {
    numerator: polynomialPower(value.numerator, exponent),
    denominator: polynomialPower(value.denominator, exponent),
    constraints: new Set(value.constraints),
  };
}

function tokenize(expression: string): Token[] {
  if (typeof expression !== "string" || !expression.trim()) throw new SymbolicError("symbolic_expression_missing");
  if (expression.length > MAX_EXPRESSION_LENGTH) throw new SymbolicError("symbolic_expression_too_long");
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const rest = expression.slice(index);
    const whitespace = rest.match(/^\s+/);
    if (whitespace) {
      index += whitespace[0].length;
      continue;
    }
    const number = rest.match(/^((?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?/);
    if (number) {
      tokens.push({ kind: "number", value: number[0] });
      index += number[0].length;
      continue;
    }
    const identifier = rest.match(/^[A-Za-z][A-Za-z0-9_]*/);
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    const operator = rest[0];
    if ("+-*/^()".includes(operator)) {
      tokens.push({ kind: "operator", value: operator as Operator });
      index += 1;
      continue;
    }
    throw new SymbolicError("symbolic_unsupported_token");
  }
  if (tokens.length > MAX_TOKENS) throw new SymbolicError("symbolic_complexity_limit");
  return tokens;
}

class Parser {
  private index = 0;
  readonly usedVariables = new Set<string>();

  constructor(private readonly tokens: Token[]) {}

  parse(): RationalExpression {
    const result = this.parseExpression();
    if (this.index !== this.tokens.length) throw new SymbolicError("symbolic_unsupported_syntax");
    return result;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private consumeOperator(value: Operator): boolean {
    const token = this.peek();
    if (token?.kind === "operator" && token.value === value) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private parseExpression(): RationalExpression {
    let result = this.parseTerm();
    while (true) {
      if (this.consumeOperator("+")) result = rationalAdd(result, this.parseTerm());
      else if (this.consumeOperator("-")) result = rationalSubtract(result, this.parseTerm());
      else return result;
    }
  }

  private parseTerm(): RationalExpression {
    let result = this.parseUnary();
    while (true) {
      if (this.consumeOperator("*")) result = rationalMultiply(result, this.parseUnary());
      else if (this.consumeOperator("/")) result = rationalDivide(result, this.parseUnary());
      else return result;
    }
  }

  /** Unary signs bind less tightly than exponentiation: -x^2 means -(x^2). */
  private parseUnary(): RationalExpression {
    if (this.consumeOperator("+")) return this.parseUnary();
    if (this.consumeOperator("-")) return rationalNegate(this.parseUnary());
    return this.parsePower();
  }

  private parsePower(): RationalExpression {
    let result = this.parsePrimary();
    if (this.consumeOperator("^")) {
      const token = this.peek();
      if (token?.kind !== "number" || !/^\d+$/.test(token.value)) {
        throw new SymbolicError("symbolic_exponent_unsupported");
      }
      this.index += 1;
      result = rationalPower(result, Number(token.value));
      if (this.consumeOperator("^")) throw new SymbolicError("symbolic_exponent_unsupported");
    }
    return result;
  }

  private parsePrimary(): RationalExpression {
    const token = this.peek();
    if (!token) throw new SymbolicError("symbolic_unexpected_end");
    if (token.kind === "number") {
      this.index += 1;
      return rationalConstant(parseExactNumber(token.value));
    }
    if (token.kind === "identifier") {
      this.index += 1;
      this.usedVariables.add(token.value);
      return rationalVariable(token.value);
    }
    if (this.consumeOperator("(")) {
      const result = this.parseExpression();
      if (!this.consumeOperator(")")) throw new SymbolicError("symbolic_parenthesis_mismatch");
      return result;
    }
    throw new SymbolicError("symbolic_unsupported_syntax");
  }
}

function parseRational(expression: string): { value: RationalExpression; variables: Set<string> } {
  const parser = new Parser(tokenize(expression));
  return { value: parser.parse(), variables: parser.usedVariables };
}

function rationalCanonical(value: RationalExpression): string {
  return `(${polynomialCanonical(value.numerator)})/(${polynomialCanonical(value.denominator)})`;
}

function rationalEquivalent(a: RationalExpression, b: RationalExpression): boolean {
  return polynomialEqual(
    polynomialMultiply(a.numerator, b.denominator),
    polynomialMultiply(b.numerator, a.denominator),
  );
}

function splitEquation(input: string): [string, string] {
  const parts = input.split("=");
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    throw new SymbolicError("symbolic_equation_format_invalid");
  }
  return [parts[0], parts[1]];
}

function parseRelation(
  input: string,
  relation: StudySymbolicRelation,
): { value: RationalExpression; variables: Set<string>; canonical: string } {
  if (relation === "expression") {
    if (input.includes("=")) throw new SymbolicError("symbolic_expression_contains_equation");
    const parsed = parseRational(input);
    return { ...parsed, canonical: rationalCanonical(parsed.value) };
  }
  if (relation !== "equation") throw new SymbolicError("symbolic_relation_unsupported");
  const [leftText, rightText] = splitEquation(input);
  const left = parseRational(leftText);
  const right = parseRational(rightText);
  const value = rationalSubtract(left.value, right.value);
  return {
    value,
    variables: new Set([...left.variables, ...right.variables]),
    canonical: polynomialZeroSetCanonical(value.numerator),
  };
}

function cleanClaimId(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 200) : "";
}

function normalizeVariables(input: unknown): string[] {
  if (!Array.isArray(input)) throw new SymbolicError("symbolic_variables_missing");
  const variables = [...new Set(input.map((value) => typeof value === "string" ? value.trim() : "").filter(Boolean))];
  if (variables.length > MAX_VARIABLES) throw new SymbolicError("symbolic_too_many_variables");
  if (variables.some((name) => !/^[A-Za-z][A-Za-z0-9_]*$/.test(name))) {
    throw new SymbolicError("symbolic_variable_invalid");
  }
  return variables.sort();
}

function normalizeAssumptions(
  assumptions: StudySymbolicAssumptions | null | undefined,
  declaredVariables: Set<string>,
): Set<string> {
  const values = assumptions?.nonZeroExpressions;
  if (values == null) return new Set();
  if (!Array.isArray(values) || values.length > 30) throw new SymbolicError("symbolic_assumptions_invalid");
  const result = new Set<string>();
  for (const raw of values) {
    if (typeof raw !== "string" || !raw.trim()) throw new SymbolicError("symbolic_assumptions_invalid");
    const parsed = parseRational(raw);
    for (const variable of parsed.variables) {
      if (!declaredVariables.has(variable)) throw new SymbolicError("symbolic_undeclared_variable");
    }
    if (!polynomialIsConstant(parsed.value.denominator) || parsed.value.constraints.size) {
      throw new SymbolicError("symbolic_assumption_requires_simple_expression");
    }
    if (polynomialIsZero(parsed.value.numerator)) throw new SymbolicError("symbolic_impossible_nonzero_assumption");
    if (!polynomialIsConstant(parsed.value.numerator)) {
      result.add(polynomialZeroSetCanonical(parsed.value.numerator));
    }
  }
  return result;
}

function symmetricDifference(a: Set<string>, b: Set<string>): string[] {
  return [...new Set([...a, ...b])].filter((value) => a.has(value) !== b.has(value)).sort();
}

function traceEvidenceRef(trace: StudySymbolicVerificationTrace): string {
  const digest = createHash("sha256").update(JSON.stringify(trace)).digest("hex").slice(0, 24);
  return `quantora:symbolic:${STUDY_SYMBOLIC_VERIFIER_VERSION}:${digest}`;
}

function insufficient(reasonCode: string): StudySymbolicVerificationResult {
  return {
    check: { verifier: "symbolic", status: "insufficient", evidenceRefs: [], reasonCode },
    trace: null,
  };
}

function resolved(trace: StudySymbolicVerificationTrace): StudySymbolicVerificationResult {
  return {
    check: {
      verifier: "symbolic",
      status: trace.decision,
      evidenceRefs: [traceEvidenceRef(trace)],
      reasonCode: trace.reasonCode,
    },
    trace,
  };
}

/**
 * Exact symbolic verification for a deliberately restricted algebraic subset.
 *
 * Supported: multivariate polynomials, rational expressions, + - * /,
 * parentheses, integer powers 0..8, exact decimals, and a conservative class
 * of equation equivalence. Every variable and domain is explicit.
 *
 * Unsupported functions (trig/log/root), implicit multiplication, symbolic
 * exponents, inequalities, and expressions beyond complexity guards return
 * `insufficient`; they are never guessed and this is not a formal prover.
 */
export function verifyStudySymbolicClaim(
  request: StudySymbolicVerificationRequest,
): StudySymbolicVerificationResult {
  try {
    const claimId = cleanClaimId(request?.claimId);
    if (!claimId) return insufficient("symbolic_invalid_claim_id");
    if (request?.domain !== "real" && request?.domain !== "complex") {
      return insufficient("symbolic_domain_required");
    }
    if (request?.relation !== "expression" && request?.relation !== "equation") {
      return insufficient("symbolic_relation_unsupported");
    }

    const variables = normalizeVariables(request?.variables);
    const declaredVariables = new Set(variables);
    const actual = parseRelation(request.actual, request.relation);
    const expected = parseRelation(request.expected, request.relation);
    for (const variable of new Set([...actual.variables, ...expected.variables])) {
      if (!declaredVariables.has(variable)) return insufficient("symbolic_undeclared_variable");
    }

    const nonZeroAssumptions = normalizeAssumptions(request.assumptions, declaredVariables);
    const traceBase = {
      version: STUDY_SYMBOLIC_VERIFIER_VERSION,
      claimId,
      relation: request.relation,
      domain: request.domain,
      variables,
      actualCanonical: actual.canonical,
      expectedCanonical: expected.canonical,
      actualDomainConstraints: [...actual.value.constraints].sort(),
      expectedDomainConstraints: [...expected.value.constraints].sort(),
      nonZeroAssumptions: [...nonZeroAssumptions].sort(),
    };

    if (request.relation === "expression") {
      if (!rationalEquivalent(actual.value, expected.value)) {
        return resolved({ ...traceBase, decision: "rejected", reasonCode: "symbolic_not_equivalent" });
      }
    } else if (actual.canonical !== expected.canonical) {
      // Non-proportional equation polynomials are not enough to prove different
      // solution sets (for example x=0 and x^2=0). Fail closed instead.
      return insufficient("symbolic_equation_equivalence_not_proven");
    }

    const unmatchedDomainConstraints = symmetricDifference(actual.value.constraints, expected.value.constraints);
    if (unmatchedDomainConstraints.some((constraint) => !nonZeroAssumptions.has(constraint))) {
      return insufficient("symbolic_domain_assumption_required");
    }

    return resolved({ ...traceBase, decision: "verified", reasonCode: "symbolic_exact_equivalence" });
  } catch (error) {
    if (error instanceof SymbolicError) return insufficient(error.code);
    return insufficient("symbolic_verifier_internal_error");
  }
}
