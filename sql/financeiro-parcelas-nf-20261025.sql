-- Financeiro: NF, datas de detalhe e consistência da quantidade de parcelas.
alter table public.job_parcelas
 add column if not exists numero_nf text,
 add column if not exists data_emissao_nf date,
 add column if not exists data_cobranca date,
 add column if not exists data_pagamento date;

with inconsistentes as (
 select job_id,greatest(max(numero),min(total_parcelas))::integer total_correto
 from public.job_parcelas where total_parcelas is not null
 group by job_id having count(distinct total_parcelas)>1
)
update public.job_parcelas p set total_parcelas=i.total_correto
from inconsistentes i where p.job_id=i.job_id;

create or replace function app_private.pl_job_parcela_consistente()
returns trigger language plpgsql security definer set search_path to ''
as $function$
declare v_modalidade text;v_total integer;
begin
 select j.modalidade_cobranca into v_modalidade from public.jobs j where j.id=new.job_id;
 if v_modalidade is null then raise exception 'Job não encontrado';
 elsif v_modalidade='recorrente' then
  if new.competencia is null then raise exception 'Informe a competência da cobrança recorrente'; end if;
  new.total_parcelas:=null;
 elsif v_modalidade='unico' then new.numero:=1;new.total_parcelas:=1;
 else
  if new.total_parcelas is null or new.total_parcelas<1 then raise exception 'Informe a quantidade total de parcelas';end if;
  select p.total_parcelas into v_total from public.job_parcelas p
  where p.job_id=new.job_id and p.id is distinct from new.id and p.total_parcelas is not null
  order by p.numero limit 1;
  if v_total is not null and new.total_parcelas<>v_total then
   raise exception 'A quantidade de parcelas deste job já está definida como %',v_total;
  end if;
 end if;
 return new;
end $function$;

drop trigger if exists pl_job_parcela_consistente on public.job_parcelas;
create trigger pl_job_parcela_consistente before insert or update on public.job_parcelas
for each row execute function app_private.pl_job_parcela_consistente();

create or replace function public.pl_meus_jobs()
returns jsonb language sql stable security definer set search_path to 'public','pg_temp'
as $function$
select coalesce(jsonb_agg(jsonb_build_object(
'id',j.id,'titulo',j.titulo,'cliente',c.nome,'status',s.nome,'prazo',j.prazo_entrega,
'empreendimento',e.nome,'valor_acordado',j.valor_acordado,
'modalidade_cobranca',j.modalidade_cobranca,'valor_mensal',j.valor_mensal,
'dia_vencimento_recorrente',j.dia_vencimento_recorrente,
'inicio_recorrencia',j.inicio_recorrencia,'recorrencia_ativa',j.recorrencia_ativa,
'descricao_servico_nf',j.descricao_servico_nf
) order by j.criado_em desc),'[]'::jsonb)
from public.jobs j join public.clientes c on c.id=j.cliente_principal_id
left join public.status_job s on s.id=j.status_id
left join public.empreendimentos e on e.id=j.empreendimento_id
where c.nome not like '% (DEMO)' and public.pl_job_autorizado(j.id)
$function$;
