-- Reuse existing report tables and the application's administrator permission.
alter table public.relatorios_fotograficos add column if not exists album_id uuid references public.albuns(id);
create index if not exists relatorios_album_idx on public.relatorios_fotograficos(album_id);
create index if not exists relatorio_fotos_relatorio_idx on public.relatorio_fotografias(relatorio_id);
grant select,insert,update,delete on public.relatorios_fotograficos,public.relatorio_fotografias to authenticated;
create policy report_admin_insert on public.relatorios_fotograficos for insert to authenticated with check ((select app_private.is_admin()) and exists(select 1 from public.albuns a where a.id=album_id));
create policy report_admin_update on public.relatorios_fotograficos for update to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()) and exists(select 1 from public.albuns a where a.id=album_id));
create policy report_admin_delete on public.relatorios_fotograficos for delete to authenticated using ((select app_private.is_admin()));
create policy report_items_admin_insert on public.relatorio_fotografias for insert to authenticated with check ((select app_private.is_admin()) and exists(select 1 from public.relatorios_fotograficos r join public.album_fotografias af on af.album_id=r.album_id where r.id=relatorio_id and af.fotografia_id=relatorio_fotografias.fotografia_id));
create policy report_items_admin_update on public.relatorio_fotografias for update to authenticated using ((select app_private.is_admin())) with check ((select app_private.is_admin()) and exists(select 1 from public.relatorios_fotograficos r join public.album_fotografias af on af.album_id=r.album_id where r.id=relatorio_id and af.fotografia_id=relatorio_fotografias.fotografia_id));
create policy report_items_admin_delete on public.relatorio_fotografias for delete to authenticated using ((select app_private.is_admin()));
create or replace function public.pl_salvar_relatorio(p_id uuid,p_album_id uuid,p_titulo text,p_descricao text,p_layout integer,p_items jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid; album_job uuid;
begin
 if auth.uid() is null or not app_private.is_admin() then raise exception 'Apenas administradores autorizados podem salvar relatórios' using errcode='42501'; end if;
 if length(trim(p_titulo))=0 or length(p_titulo)>160 or length(coalesce(p_descricao,''))>500 or p_layout not in (1,2,4,6,9,16) then raise exception 'Dados do relatório inválidos'; end if;
 select a.job_principal_id into album_job from public.albuns a where a.id=p_album_id;
 if not found then raise exception 'Álbum não autorizado'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>2000 then raise exception 'Seleção de fotos inválida'; end if;
 if exists(select 1 from jsonb_to_recordset(p_items) as x(fotografia_id uuid,ordem integer,incluir boolean,legenda text,fotos_por_pagina_override integer)
 where x.ordem is null or x.ordem<0 or x.incluir is null or length(coalesce(x.legenda,''))>1000 or (x.fotos_por_pagina_override is not null and x.fotos_por_pagina_override not in (1,2,4,6,9,16)) or not exists(select 1 from public.album_fotografias af join public.fotografias f on f.id=af.fotografia_id where af.album_id=p_album_id and af.fotografia_id=x.fotografia_id and f.excluida_em is null)) then raise exception 'Fotografia ou layout inválido'; end if;
 if not exists(select 1 from jsonb_to_recordset(p_items) as x(incluir boolean) where x.incluir) then raise exception 'Selecione ao menos uma fotografia'; end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct x.fotografia_id) from jsonb_to_recordset(p_items) as x(fotografia_id uuid)) then raise exception 'Fotografia duplicada'; end if;
 if p_id is null then
 insert into public.relatorios_fotograficos(album_id,job_id,titulo,descricao,fotos_por_pagina) values(p_album_id,album_job,trim(p_titulo),p_descricao,p_layout) returning id into result_id;
 else
 -- Serialize edits of the same document; the entire replacement is atomic.
 perform 1 from public.relatorios_fotograficos where id=p_id and album_id=p_album_id for update;
 if not found then raise exception 'Relatório não autorizado'; end if;
 update public.relatorios_fotograficos set titulo=trim(p_titulo),descricao=p_descricao,fotos_por_pagina=p_layout,atualizado_em=now() where id=p_id returning id into result_id;
 delete from public.relatorio_fotografias where relatorio_id=result_id;
 end if;
 insert into public.relatorio_fotografias(relatorio_id,fotografia_id,ordem,incluir,legenda,observacao,destaque_no_relatorio,fotos_por_pagina_override)
 select result_id,x.fotografia_id,x.ordem,x.incluir,x.legenda,x.observacao,coalesce(x.destaque_no_relatorio,false),x.fotos_por_pagina_override
 from jsonb_to_recordset(p_items) as x(fotografia_id uuid,ordem integer,incluir boolean,legenda text,observacao text,destaque_no_relatorio boolean,fotos_por_pagina_override integer);
 return result_id;
end $$;
revoke all on function public.pl_salvar_relatorio(uuid,uuid,text,text,integer,jsonb) from public,anon;
grant execute on function public.pl_salvar_relatorio(uuid,uuid,text,text,integer,jsonb) to authenticated;
