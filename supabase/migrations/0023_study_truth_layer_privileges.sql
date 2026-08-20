-- Tighten Study Truth Layer service-role privileges.
-- Supabase may provision broader default table privileges for service_role on
-- newly created public tables. Revoke those defaults before applying the exact
-- server capabilities required by Study v1.

revoke all on public.study_concepts from service_role;
revoke all on public.study_concept_edges from service_role;
revoke all on public.study_curricula from service_role;
revoke all on public.study_curriculum_mappings from service_role;
revoke all on public.study_mastery_events from service_role;
revoke all on public.study_mastery_estimates from service_role;

grant select, insert, update, delete on public.study_concepts to service_role;
grant select, insert, update, delete on public.study_concept_edges to service_role;
grant select, insert, update, delete on public.study_curricula to service_role;
grant select, insert, update, delete on public.study_curriculum_mappings to service_role;

-- Learner evidence is append-only through the application boundary. Historical
-- evidence can be removed only through account-level cascade deletion, not by
-- ordinary Study repository operations.
grant select, insert on public.study_mastery_events to service_role;

-- Estimates are explicitly derived/recomputable state.
grant select, insert, update, delete on public.study_mastery_estimates to service_role;
