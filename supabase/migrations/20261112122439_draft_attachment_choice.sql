-- NULL distinguishes legacy drafts from an explicitly unchecked choice.
alter table public.crm_message_drafts add column attach_evjf boolean;
comment on column public.crm_message_drafts.attach_evjf is 'Saved EVJF PDF choice; NULL means legacy draft without a recorded choice.';
