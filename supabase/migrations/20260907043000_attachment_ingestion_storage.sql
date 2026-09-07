insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'quantora-attachments',
  'quantora-attachments',
  false,
  5242880,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'text/plain',
    'text/csv',
    'text/tab-separated-values',
    'text/markdown',
    'text/html',
    'text/xml',
    'application/xml',
    'application/json',
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table storage.buckets is 'Supabase-managed Storage bucket registry. quantora-attachments is private and bounded to 5 MiB per object.';
