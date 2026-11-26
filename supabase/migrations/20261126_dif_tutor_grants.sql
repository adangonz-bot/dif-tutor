-- Applied 2026-11-26: new tables in this project are not exposed to the Data API by default.
grant select, insert, update, delete on public.dif_attempts, public.dif_attempt_ink, public.dif_progress to authenticated;
grant select on public.dif_tutor_usage to authenticated;
grant all on public.dif_attempts, public.dif_attempt_ink, public.dif_progress, public.dif_tutor_usage to service_role;
