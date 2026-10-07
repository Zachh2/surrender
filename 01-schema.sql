-- Run this entire file in your new Supabase project's SQL Editor.
-- No credentials or default teacher password are stored in this SQL.
begin;
create schema if not exists surrender_private;
revoke all on schema surrender_private from public, anon, authenticated;
create table if not exists surrender_private.records (
  id text primary key,
  owner_hash text not null check (owner_hash ~ '^[a-f0-9]{64}$'),
  body jsonb not null,
  surrendered_at timestamptz not null,
  due_at timestamptz not null,
  returned_at timestamptz,
  active boolean not null default true,
  check (jsonb_typeof(body) = 'object'),
  check ((active and returned_at is null) or (not active and returned_at is not null))
);
create index if not exists surrender_owner_idx on surrender_private.records(owner_hash);
create index if not exists surrender_due_idx on surrender_private.records(due_at) where active;
create index if not exists surrender_history_idx on surrender_private.records(returned_at) where not active;
create unique index if not exists surrender_one_active_device on surrender_private.records(owner_hash) where active;
create table if not exists surrender_private.sessions (
  token_hash text primary key,
  auth_version text not null,
  expires_at timestamptz not null
);
create table if not exists surrender_private.login_limits (
  bucket text primary key,
  attempts integer not null default 0,
  expires_at timestamptz not null
);
alter table surrender_private.records enable row level security;
alter table surrender_private.sessions enable row level security;
alter table surrender_private.login_limits enable row level security;
revoke all on all tables in schema surrender_private from public, anon, authenticated;

create or replace function surrender_private.close_at(p_start timestamptz)
returns timestamptz language sql immutable set search_path = ''
as $$
  select (date_trunc('day', p_start at time zone 'Asia/Manila') +
    interval '18 hours' +
    case when (p_start at time zone 'Asia/Manila')::time >= time '18:00'
      then interval '1 day' else interval '0' end) at time zone 'Asia/Manila';
$$;

create or replace function surrender_private.maintain(p_now timestamptz default now())
returns void language plpgsql security definer set search_path = ''
as $$
begin
  -- All app mutations use this transaction lock. It prevents serverless instances
  -- from racing a return, duplicate submission, cleanup or scheduled auto-close.
  perform pg_advisory_xact_lock(202610, 1800);
  update surrender_private.records
    set active = false, returned_at = due_at,
        body = body || jsonb_build_object('active',false,'returnedAt',due_at,'autoClosed',true)
    where active and due_at <= p_now;
  delete from surrender_private.records where not active and returned_at <= p_now - interval '30 days';
  delete from surrender_private.sessions where expires_at <= p_now;
  delete from surrender_private.login_limits where expires_at <= p_now;
end;
$$;

create or replace function public.surrender_maintain()
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  perform surrender_private.maintain();
  return jsonb_build_object('ok',true);
end;
$$;

create or replace function public.surrender_rpc(p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r surrender_private.records%rowtype;
  existing surrender_private.records%rowtype;
  attempts_count integer;
  incoming jsonb;
  begin_time timestamptz;
  end_time timestamptz;
  due_time timestamptz;
  server_now timestamptz := now();
  owner_key text := p_args->>'ownerHash';
  record_key text;
  result jsonb;
begin
  perform surrender_private.maintain(server_now);
  if p_action = 'health' then
    return jsonb_build_object('ok',true,'service','phone-surrender','mode','cloud','schema',5);
  end if;

  if p_action = 'login' then
    insert into surrender_private.login_limits(bucket, attempts, expires_at)
      values (p_args->>'bucket',1,server_now + interval '10 minutes')
      on conflict (bucket) do update set attempts = surrender_private.login_limits.attempts + 1
      returning attempts into attempts_count;
    if attempts_count > 10 then
      return jsonb_build_object('error','Too many attempts. Try again in 10 minutes.','status',429);
    end if;
    if not coalesce((p_args->>'passwordMatches')::boolean,false) then
      return jsonb_build_object('error','Incorrect teacher password.','status',401);
    end if;
    delete from surrender_private.login_limits where bucket = p_args->>'bucket';
    insert into surrender_private.sessions(token_hash,auth_version,expires_at)
      values(p_args->>'tokenHash',p_args->>'authVersion',server_now + interval '24 hours');
    return jsonb_build_object('ok',true);
  end if;

  if p_action in ('teacher_records','teacher_return','logout') then
    if not exists(select 1 from surrender_private.sessions
      where token_hash = p_args->>'tokenHash' and auth_version = p_args->>'authVersion'
      and expires_at > server_now) then
      return jsonb_build_object('error','Teacher sign-in required.','status',401);
    end if;
    if p_action = 'logout' then
      delete from surrender_private.sessions where token_hash = p_args->>'tokenHash';
      return jsonb_build_object('ok',true);
    end if;
    if p_action = 'teacher_records' then
      select coalesce(jsonb_agg(body order by surrendered_at desc),'[]'::jsonb)
        into result from surrender_private.records;
      return result;
    end if;
    select * into r from surrender_private.records where id = p_args->>'id';
    if not found then return jsonb_build_object('error','Record no longer exists.','status',404); end if;
    if r.active then
      update surrender_private.records set active = false,returned_at = server_now,
        body = body || jsonb_build_object('active',false,'returnedAt',server_now,'autoClosed',false)
        where id = r.id returning * into r;
    end if;
    return r.body;
  end if;

  if p_action in ('student_records','submit') then
    if owner_key is null or owner_key !~ '^[a-f0-9]{64}$' then
      return jsonb_build_object('error','Student device key required.','status',401);
    end if;
    if p_action = 'student_records' then
      select coalesce(jsonb_agg(body order by surrendered_at desc),'[]'::jsonb)
        into result from surrender_private.records where owner_hash = owner_key;
      return result;
    end if;
    incoming := p_args->'record';
    record_key := incoming->>'id';
    if record_key is null or record_key !~ '^[a-zA-Z0-9-]{8,100}$' then
      return jsonb_build_object('error','Invalid record ID.','status',400);
    end if;
    select * into existing from surrender_private.records where id = record_key;
    if found then
      if existing.owner_hash <> owner_key then return jsonb_build_object('error','Record belongs to another device.','status',403); end if;
      if not existing.active then return existing.body; end if;
      -- Identity and check-in time are immutable after the initial save.
      incoming := existing.body || jsonb_build_object('active',(incoming->>'active')::boolean,'returnedAt',incoming->'returnedAt');
      begin_time := existing.surrendered_at;
      due_time := existing.due_at;
    else
      begin_time := (incoming->>'surrenderedAt')::timestamptz;
      due_time := surrender_private.close_at(begin_time);
      if begin_time is null or begin_time > server_now + interval '5 minutes' then
        return jsonb_build_object('error','Check the date and time on this phone.','status',400);
      end if;
      if begin_time < server_now - interval '30 days' then
        return jsonb_build_object('error','Record is outside the 30-day retention period.','status',410);
      end if;
      if (incoming->>'active')::boolean then
        select * into r from surrender_private.records where owner_hash = owner_key and active;
        if found then return r.body; end if;
      end if;
    end if;
    if coalesce(incoming->>'name','') = '' or coalesce(incoming->>'section','') not in ('Cirrus','Alto','Stratus','Nimbus','Other')
      or jsonb_typeof(incoming->'active') is distinct from 'boolean' then
      return jsonb_build_object('error','Invalid student record.','status',400);
    end if;
    if not (incoming->>'active')::boolean then
      end_time := (incoming->>'returnedAt')::timestamptz;
      if end_time is null or end_time < begin_time or end_time > server_now + interval '5 minutes' then
        return jsonb_build_object('error','Invalid return time.','status',400);
      end if;
      end_time := least(end_time,due_time);
    elsif due_time <= server_now then
      end_time := due_time;
    else
      end_time := null;
    end if;
    if end_time is not null and end_time <= server_now - interval '30 days' then
      return jsonb_build_object('error','Record expired.','status',410);
    end if;
    result := jsonb_build_object(
      'id',record_key,'name',incoming->>'name','section',incoming->>'section',
      'phone',incoming->>'phone','surrenderedAt',begin_time,'active',end_time is null,
      'autoClosed',coalesce(end_time = due_time,false)
    );
    if end_time is not null then result := result || jsonb_build_object('returnedAt',end_time); end if;
    insert into surrender_private.records(id,owner_hash,body,surrendered_at,due_at,returned_at,active)
      values(record_key,owner_key,result,begin_time,due_time,end_time,end_time is null)
      on conflict(id) do update set body = excluded.body, returned_at = excluded.returned_at, active = excluded.active;
    return result;
  end if;
  return jsonb_build_object('error','Unknown operation.','status',404);
end;
$$;

-- Functions are backend-only. No browser key can read a register or bypass login.
revoke all on all functions in schema surrender_private from public, anon, authenticated;
revoke all on function public.surrender_rpc(text,jsonb) from public, anon, authenticated;
revoke all on function public.surrender_maintain() from public, anon, authenticated;
grant execute on function public.surrender_rpc(text,jsonb) to service_role;
grant execute on function public.surrender_maintain() to service_role;
notify pgrst, 'reload schema';
commit;
