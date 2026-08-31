# Study Curriculum Grounding V3

## Purpose

Curriculum Grounding V3 gives Study Tutor a conservative trust boundary for factual curriculum claims.

The governing rule is:

> Generative AI may propose a fact. Quantora may call it verified only when the source authority and the supporting evidence both pass deterministic checks.

This phase does not turn every official web page into truth and does not treat model confidence as evidence.

## Modes

### Exam Grounded

Exam Grounded accepts only sources whose authority is recognized by Quantora-owned code. Caller labels such as `kind: official` are hints only and cannot elevate an arbitrary URL.

The initial governed authority registry covers official NCERT, CBSE, NTA/JEE/NEET, Singapore SEAB and Singapore MOE hosts used by the Study product.

A new board, curriculum provider or reviewed corpus must be added through code review before it can satisfy Exam Grounded verification.

### Explore

Explore may use ordinary HTTPS web sources and connected sources, but the citation still has to bind to the source admitted by the verification plan.

Explore permission is not silently inherited when the verification mode is invalid or missing.

## Two independent checks

### 1. Authority admission

`study-grounding.ts` classifies each source from its actual URL/ref.

It rejects or downgrades:

- caller-made `official` labels on normal websites;
- look-alike domains such as `ncert.nic.in.evil.example`;
- HTTP sources for canonical authority;
- non-standard HTTPS ports for canonical authority;
- opaque caller-made authority identifiers.

An official host only means the source is eligible for Exam Grounded verification. It does not prove any particular sentence.

### 2. Claim support

`study-grounded-source-verifier.ts` implements the narrow support case V3 can prove deterministically.

A curriculum fact is verified only when:

1. the claim is atomic and non-trivial;
2. the source is allowed for the current Study mode;
3. source text retrieved server-side (or supplied by a reviewed corpus) is available;
4. the claim appears in that text after harmless Unicode and whitespace normalization; and
5. the resulting evidence ref binds back to a source admitted by the verification plan.

Paraphrase, semantic entailment, contradiction detection, OCR uncertainty and missing source text are deliberately `insufficient` in V3. They are never guessed from model prose.

## Shared runtime

The existing `study-verification-runtime.ts` remains the single bridge between verification plans and implemented verifiers.

V3 adds `grounded_source` to that runtime beside numeric, symbolic and reviewed-assessment verification. The runtime rebinds `claimId` and `mode` from the plan so a caller cannot change those after planning.

The final resolver also checks that grounded evidence came from a source admitted by the plan. A valid fact found on some other official source cannot silently satisfy a plan that named a different source.

## Evidence trace

Successful deterministic grounding emits a trace containing:

- verifier version;
- claim id;
- Study mode;
- normalized source ref;
- source kind and authority id;
- SHA-256-derived claim digest;
- SHA-256-derived retrieved-text digest;
- deterministic decision/reason code.

The learner-facing evidence ref remains the source URL/ref so it is auditable and navigable.

## Security and trust boundary

The grounded-source verifier does not fetch the internet itself. `sourceText` is a server-side trust boundary: production callers must populate it from Quantora-controlled retrieval or a reviewed corpus bound to `sourceRef`, never from model-generated text or an untrusted client payload.

This PR establishes the verifier contract and runtime seam. A future retrieval/ingestion adapter can plug into it without changing learner truth, mastery semantics or the verification resolver.

## Explicit non-goals

V3 does not:

- hardcode textbook chapter lists;
- claim that every page on an official domain is correct for every exam year;
- use embeddings or model similarity to manufacture verification;
- treat a paraphrase as proven support;
- implement OCR, PDF ingestion or web crawling;
- change learner mastery, assessment grading or Study UI;
- implement theorem proving.

## Failure policy

When authority, provenance or textual support is uncertain, the result is `insufficient`.

That is intentional. For learner truth, abstention is safer than false mastery or false curriculum certainty.
