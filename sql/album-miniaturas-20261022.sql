-- Aplicado no Supabase em 2026-10-22.
-- Mantém a fotografia original e grava o caminho da miniatura em fotografias.metadados.
create or replace function public.pl_registrar_miniatura(p_album_id uuid,p_foto_id uuid,p_caminho text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_original text;
begin
 if auth.uid() is null or not app_private.is_admin() then
   raise exception 'Miniatura não autorizada' using errcode='42501';
 end if;
 select f.arquivo_caminho into v_original
 from public.fotografias f join public.album_fotografias af on af.fotografia_id=f.id
 where af.album_id=p_album_id and f.id=p_foto_id and f.excluida_em is null;
 if v_original is null or not exists (
   select 1 from public.albuns a join public.jobs j on j.id=a.job_principal_id
   join public.clientes c on c.id=j.cliente_principal_id
   where a.id=p_album_id and
   (c.nome not like '% (DEMO)' or (a.observacoes like '[PRIVADO]%' and a.criado_por=auth.uid()))
 ) then raise exception 'Foto ou álbum não autorizado' using errcode='42501'; end if;
 if p_caminho <> p_album_id::text||'/thumbs/'||p_foto_id::text||'.jpg' then
   raise exception 'Caminho inválido';
 end if;
 if not exists(select 1 from storage.objects where bucket_id='predio-legal-fotos' and name=p_caminho)
 then raise exception 'Miniatura ausente'; end if;
 update public.fotografias
 set metadados=jsonb_set(coalesce(metadados,'{}'::jsonb),'{miniatura_caminho}',to_jsonb(p_caminho),true)
 where id=p_foto_id;
 return true;
end $$;
revoke all on function public.pl_registrar_miniatura(uuid,uuid,text) from public,anon;
grant execute on function public.pl_registrar_miniatura(uuid,uuid,text) to authenticated;

create or replace function public.pl_album_miniaturas(p_album_id uuid)
returns jsonb language sql stable security definer set search_path=''
as $$
 select case when (select auth.uid()) is not null and app_private.is_admin()
 then coalesce((select jsonb_object_agg(f.id::text,f.metadados->>'miniatura_caminho')
 from public.album_fotografias af join public.fotografias f on f.id=af.fotografia_id
 where af.album_id=p_album_id and f.metadados ? 'miniatura_caminho'), '{}'::jsonb)
 else '{}'::jsonb end
$$;
revoke all on function public.pl_album_miniaturas(uuid) from public,anon;
grant execute on function public.pl_album_miniaturas(uuid) to authenticated;
