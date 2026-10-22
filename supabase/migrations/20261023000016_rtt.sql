-- RTT : régime de temps de travail du salarié (heures au-delà de 35 h, ou forfait jours des cadres).
alter table public.employees add column if not exists time_regime text not null default 'hours'
  check (time_regime in ('hours', 'forfait_jours'));
