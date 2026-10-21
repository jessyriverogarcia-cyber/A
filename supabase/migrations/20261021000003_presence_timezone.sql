-- La journée de présence suit le fuseau de l'organisation (et non l'UTC du serveur).
create or replace view public.presence_status with (security_invoker = true) as
with last_badge as (
  select distinct on (b.employee_id) b.employee_id, b.kind, b.at
  from public.badge_events b
  join public.orgs o on o.id = b.org_id
  where b.at >= (date_trunc('day', now() at time zone o.timezone) at time zone o.timezone)
  order by b.employee_id, b.at desc
),
current_event as (
  select distinct on (c.owner_employee_id) c.owner_employee_id, c.kind, c.title
  from public.calendar_events c
  where now() between c.starts_at and c.ends_at
  order by c.owner_employee_id, c.starts_at desc
)
select
  e.id as employee_id,
  e.org_id,
  case
    when ce.kind = 'remote' then 'remote'
    when ce.kind = 'travel' then 'travel'
    when lb.kind is null or lb.kind = 'out' then 'absent'
    when lb.kind = 'break_start' then 'on_break'
    when ce.kind in ('meeting','client') then 'in_meeting'
    else 'at_station'
  end as status,
  lb.at as since,
  ce.title as current_activity,
  e.home_zone_id as zone_id
from public.employees e
left join last_badge lb on lb.employee_id = e.id
left join current_event ce on ce.owner_employee_id = e.id
where e.active;
