create or replace function public.pl_miniaturas_pendentes(p_limite integer default 400)
returns jsonb language sql stable security definer set search_path to ''
as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'album_id',a.id,'arquivo_caminho',f.arquivo_caminho) order by f.criado_em,f.id),'[]'::jsonb)
 from (select f.id,f.arquivo_caminho,f.criado_em,a.id album_id
  from public.fotografias f join public.albuns a on a.id=f.album_origem_id
  join public.jobs j on j.id=a.job_principal_id join public.clientes c on c.id=j.cliente_principal_id
  where auth.uid() is not null and app_private.is_admin()
   and f.arquivo_caminho is not null and f.excluida_em is null
   and nullif(f.metadados->>'miniatura_caminho','') is null
   and (c.nome not like '% (DEMO)' or a.observacoes like '[PRIVADO]%')
  order by f.criado_em,f.id limit least(greatest(coalesce(p_limite,400),1),500)
 ) f join public.albuns a on a.id=f.album_id
$$;
revoke all on function public.pl_miniaturas_pendentes(integer) from public,anon;
grant execute on function public.pl_miniaturas_pendentes(integer) to authenticated;
