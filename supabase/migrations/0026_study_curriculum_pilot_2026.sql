-- Study curriculum pilot v1
-- Small 2026 cross-curriculum seed: Singapore O-Level foundations -> JEE Main.
-- Official documents prove curriculum membership only. Canonical descriptions
-- are Quantora-authored and prerequisite relationships are explicitly derived.

insert into public.study_concepts
  (canonical_key, content_version, subject, label, description, status, provenance, confidence, source_ref, updated_at)
values
  ('math.trigonometry.functions', '2026-pilot-1', 'mathematics', 'Trigonometric functions', 'Interpret and use trigonometric functions across angles and representations.', 'active', 'quantora_authored', 0.98, null, now()),
  ('math.trigonometry.identities', '2026-pilot-1', 'mathematics', 'Trigonometric identities', 'Recognise, simplify and apply standard relationships between trigonometric functions.', 'active', 'quantora_authored', 0.98, null, now()),
  ('math.vector.scalar-vector', '2026-pilot-1', 'mathematics', 'Scalar and vector quantities', 'Distinguish quantities described only by magnitude from those requiring magnitude and direction.', 'active', 'quantora_authored', 0.98, null, now()),
  ('math.vector.resultant', '2026-pilot-1', 'mathematics', 'Vector addition and resultants', 'Combine vectors and determine a resultant representation.', 'active', 'quantora_authored', 0.98, null, now()),
  ('math.vector.components', '2026-pilot-1', 'mathematics', 'Vector components', 'Resolve and interpret vectors through coordinate components in two or more dimensions.', 'active', 'quantora_authored', 0.98, null, now()),
  ('physics.kinematics.speed-velocity-acceleration', '2026-pilot-1', 'physics', 'Speed, velocity and acceleration', 'Interpret and relate core kinematic rates of motion.', 'active', 'quantora_authored', 0.98, null, now()),
  ('physics.kinematics.motion-graphs', '2026-pilot-1', 'physics', 'Motion graphs', 'Interpret displacement-time and velocity-time representations of motion.', 'active', 'quantora_authored', 0.98, null, now()),
  ('physics.kinematics.motion-in-plane', '2026-pilot-1', 'physics', 'Motion in a plane', 'Analyse motion with more than one spatial component.', 'active', 'quantora_authored', 0.96, null, now()),
  ('physics.kinematics.projectile-motion', '2026-pilot-1', 'physics', 'Projectile motion', 'Apply two-dimensional kinematics to projectile trajectories.', 'active', 'quantora_authored', 0.96, null, now())
on conflict (canonical_key, content_version) do update set
  subject = excluded.subject,
  label = excluded.label,
  description = excluded.description,
  status = excluded.status,
  provenance = excluded.provenance,
  confidence = excluded.confidence,
  source_ref = excluded.source_ref,
  updated_at = now();

insert into public.study_curricula
  (curriculum_key, jurisdiction, authority, name, version, status, source_ref, updated_at)
values
  (
    'sg.seab.olevel.additional-mathematics.4049', 'singapore', 'Singapore Examinations and Assessment Board',
    'GCE O-Level Additional Mathematics (4049)', '2026', 'active',
    'https://isomer-user-content.by.gov.sg/334/f4aaac1d-0d7f-492b-88d9-43e392418490/4049_y26_sy.pdf', now()
  ),
  (
    'sg.seab.olevel.physics.6091', 'singapore', 'Singapore Examinations and Assessment Board',
    'GCE O-Level Physics (6091)', '2026', 'active',
    'https://isomer-user-content.by.gov.sg/334/42ee79d0-bb13-43f5-94ab-629729f88aa0/6091_y26_sy.pdf', now()
  ),
  (
    'in.nta.jeemain.paper1', 'india', 'National Testing Agency',
    'JEE Main Paper 1 (B.E./B.Tech.)', '2026', 'active',
    'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf', now()
  )
on conflict (curriculum_key, version) do update set
  jurisdiction = excluded.jurisdiction,
  authority = excluded.authority,
  name = excluded.name,
  status = excluded.status,
  source_ref = excluded.source_ref,
  updated_at = now();

-- Quantora-derived prerequisite graph. These links are NOT assertions that the
-- official syllabuses define this learning order.
insert into public.study_concept_edges
  (source_concept_id, target_concept_id, relation, confidence, provenance, source_ref)
select s.id, t.id, 'prerequisite_of', x.confidence, 'derived', 'quantora:study-pilot-2026:dependency-review'
from (values
  ('math.vector.scalar-vector', 'math.vector.resultant', 0.95::double precision),
  ('math.trigonometry.functions', 'math.vector.components', 0.90::double precision),
  ('math.vector.scalar-vector', 'math.vector.components', 0.95::double precision),
  ('math.vector.components', 'physics.kinematics.motion-in-plane', 0.95::double precision),
  ('physics.kinematics.speed-velocity-acceleration', 'physics.kinematics.motion-in-plane', 0.95::double precision),
  ('physics.kinematics.motion-in-plane', 'physics.kinematics.projectile-motion', 0.98::double precision)
) as x(source_key, target_key, confidence)
join public.study_concepts s on s.canonical_key = x.source_key and s.content_version = '2026-pilot-1'
join public.study_concepts t on t.canonical_key = x.target_key and t.content_version = '2026-pilot-1'
on conflict (source_concept_id, target_concept_id, relation) do update set
  confidence = excluded.confidence,
  provenance = excluded.provenance,
  source_ref = excluded.source_ref;

insert into public.study_concept_edges
  (source_concept_id, target_concept_id, relation, confidence, provenance, source_ref)
select s.id, t.id, 'supports_transfer_to', 0.80, 'derived', 'quantora:study-pilot-2026:dependency-review'
from public.study_concepts s
join public.study_concepts t on t.canonical_key = 'physics.kinematics.motion-in-plane' and t.content_version = '2026-pilot-1'
where s.canonical_key = 'physics.kinematics.motion-graphs' and s.content_version = '2026-pilot-1'
on conflict (source_concept_id, target_concept_id, relation) do update set
  confidence = excluded.confidence,
  provenance = excluded.provenance,
  source_ref = excluded.source_ref;

-- Neutral depth 0.5 is intentional in the pilot: we do not invent exam
-- weightage or pretend a calibrated cross-system difficulty scale exists yet.
insert into public.study_curriculum_mappings
  (curriculum_id, concept_id, objective_code, stage, depth, exam_weight, confidence, source_ref, updated_at)
select cur.id, con.id, m.objective_code, m.stage, 0.5, null, m.confidence, m.source_ref, now()
from (values
  ('sg.seab.olevel.additional-mathematics.4049', 'math.trigonometry.functions', 'G1', 'O-Level Additional Mathematics', 1.00::double precision, 'https://isomer-user-content.by.gov.sg/334/f4aaac1d-0d7f-492b-88d9-43e392418490/4049_y26_sy.pdf#page=7'),
  ('sg.seab.olevel.additional-mathematics.4049', 'math.trigonometry.identities', 'G1', 'O-Level Additional Mathematics', 1.00::double precision, 'https://isomer-user-content.by.gov.sg/334/f4aaac1d-0d7f-492b-88d9-43e392418490/4049_y26_sy.pdf#page=7'),
  ('sg.seab.olevel.physics.6091', 'math.vector.scalar-vector', '1(f)', 'O-Level Physics', 1.00::double precision, 'https://isomer-user-content.by.gov.sg/334/42ee79d0-bb13-43f5-94ab-629729f88aa0/6091_y26_sy.pdf#page=10'),
  ('sg.seab.olevel.physics.6091', 'math.vector.resultant', '1(g)', 'O-Level Physics', 1.00::double precision, 'https://isomer-user-content.by.gov.sg/334/42ee79d0-bb13-43f5-94ab-629729f88aa0/6091_y26_sy.pdf#page=10'),
  ('sg.seab.olevel.physics.6091', 'physics.kinematics.speed-velocity-acceleration', '2(a-d)', 'O-Level Physics', 1.00::double precision, 'https://isomer-user-content.by.gov.sg/334/42ee79d0-bb13-43f5-94ab-629729f88aa0/6091_y26_sy.pdf#page=11'),
  ('sg.seab.olevel.physics.6091', 'physics.kinematics.motion-graphs', '2(e-h)', 'O-Level Physics', 1.00::double precision, 'https://isomer-user-content.by.gov.sg/334/42ee79d0-bb13-43f5-94ab-629729f88aa0/6091_y26_sy.pdf#page=11'),
  ('in.nta.jeemain.paper1', 'math.trigonometry.functions', 'Mathematics Unit 14', 'JEE Main Paper 1', 1.00::double precision, 'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf#page=2'),
  ('in.nta.jeemain.paper1', 'math.trigonometry.identities', 'Mathematics Unit 14', 'JEE Main Paper 1', 1.00::double precision, 'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf#page=2'),
  ('in.nta.jeemain.paper1', 'math.vector.scalar-vector', 'Mathematics Unit 12', 'JEE Main Paper 1', 1.00::double precision, 'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf#page=2'),
  ('in.nta.jeemain.paper1', 'math.vector.resultant', 'Mathematics Unit 12', 'JEE Main Paper 1', 0.90::double precision, 'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf#page=2'),
  ('in.nta.jeemain.paper1', 'math.vector.components', 'Mathematics Unit 12', 'JEE Main Paper 1', 1.00::double precision, 'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf#page=2'),
  ('in.nta.jeemain.paper1', 'physics.kinematics.speed-velocity-acceleration', 'Physics Unit 2', 'JEE Main Paper 1', 1.00::double precision, 'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf#page=3'),
  ('in.nta.jeemain.paper1', 'physics.kinematics.motion-in-plane', 'Physics Unit 2', 'JEE Main Paper 1', 1.00::double precision, 'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf#page=3'),
  ('in.nta.jeemain.paper1', 'physics.kinematics.projectile-motion', 'Physics Unit 2', 'JEE Main Paper 1', 1.00::double precision, 'https://cdnbbsr.s3waas.gov.in/s3f8e59f4b2fe7c5705bf878bbd494ccdf/uploads/2025/10/202510311323551056.pdf#page=3')
) as m(curriculum_key, concept_key, objective_code, stage, confidence, source_ref)
join public.study_curricula cur on cur.curriculum_key = m.curriculum_key and cur.version = '2026'
join public.study_concepts con on con.canonical_key = m.concept_key and con.content_version = '2026-pilot-1'
on conflict (curriculum_id, concept_id, objective_code, stage) do update set
  depth = excluded.depth,
  exam_weight = excluded.exam_weight,
  confidence = excluded.confidence,
  source_ref = excluded.source_ref,
  updated_at = now();
