-- Run AFTER 01-schema.sql. This schedules database maintenance independently
-- of Vercel, so auto-unsurrender works even with every browser closed.
create extension if not exists pg_cron;
-- UTC 10:00 = 18:00 Philippine time. The named schedule is safe to rerun.
select cron.schedule('surrender-desk-daily-close', '0 10 * * *',
  $$select public.surrender_maintain();$$);
-- Catch up after downtime and expire history throughout the day as well.
select cron.schedule('surrender-desk-maintenance', '*/10 * * * *',
  $$select public.surrender_maintain();$$);

-- Verify both jobs show active = true:
select jobname, schedule, active from cron.job
  where jobname in ('surrender-desk-daily-close','surrender-desk-maintenance');
