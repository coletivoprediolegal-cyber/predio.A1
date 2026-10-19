-- Deduplicação por eTag do objeto armazenado + tamanho. O teste ocorre
-- após o upload e antes de vincular a fotografia ao álbum.
create or replace function app_private.pl_album_duplicate_by_etag(p_album_id uuid,p_caminho text)
returns uuid language sql stable set search_path = '' as $body$
 select f.id
 from storage.objects incoming
 join storage.objects existing
   on existing.bucket_id='predio-legal-fotos'
  and existing.metadata->>'eTag'=incoming.metadata->>'eTag'
  and existing.metadata->>'size'=incoming.metadata->>'size'
 join public.fotografias f on f.arquivo_caminho=existing.name
 join public.album_fotografias af on af.fotografia_id=f.id and af.album_id=p_album_id
 where incoming.bucket_id='predio-legal-fotos'
   and incoming.name=p_caminho
   and incoming.metadata->>'eTag' is not null
   and existing.name<>p_caminho
 order by af.ordem,f.id
 limit 1
$body$;
revoke all on function app_private.pl_album_duplicate_by_etag(uuid,text) from public,anon,authenticated;

create or replace function public.pl_album_foto_registrar_dedupe(
 p_album_id uuid,p_caminho text,p_nome text,p_mime text,p_bytes bigint,
 p_largura integer default null,p_altura integer default null,
 p_capturada_em timestamptz default null,p_data_original_local date default null,
 p_data_origem text default null
) returns jsonb language plpgsql security definer set search_path = '' as $body$
declare v_duplicate uuid;v_id uuid;v_num integer;
begin
 if auth.uid() is null or not app_private.is_admin() then
  raise exception 'Registro de fotografia não autorizado' using errcode='42501';
 end if;
 perform 1 from public.albuns a
 join public.jobs j on j.id=a.job_principal_id
 join public.clientes c on c.id=j.cliente_principal_id
 where a.id=p_album_id
   and (c.nome not like '% (DEMO)' or
        (a.observacoes like '[PRIVADO]%' and a.criado_por=auth.uid() and app_private.is_admin()))
 for update of a;
 if not found then raise exception 'Álbum não autorizado'; end if;
 if p_caminho is null or p_caminho not like p_album_id::text||'/%' then
  raise exception 'Caminho inválido';
 end if;
 v_duplicate:=app_private.pl_album_duplicate_by_etag(p_album_id,p_caminho);
 if v_duplicate is not null then
  return jsonb_build_object('id',v_duplicate,'duplicada',true);
 end if;
 v_id:=public.pl_album_foto_registrar_v2(
  p_album_id,p_caminho,p_nome,p_mime,p_bytes,p_largura,p_altura,
  p_capturada_em,p_data_original_local,p_data_origem
 );
 select af.ordem into v_num from public.album_fotografias af
 where af.album_id=p_album_id and af.fotografia_id=v_id;
 return jsonb_build_object('id',v_id,'duplicada',false,'numero',v_num);
end $body$;
revoke all on function public.pl_album_foto_registrar_dedupe(
 uuid,text,text,text,bigint,integer,integer,timestamptz,date,text
) from public,anon,authenticated;
grant execute on function public.pl_album_foto_registrar_dedupe(
 uuid,text,text,text,bigint,integer,integer,timestamptz,date,text
) to authenticated;

create table if not exists app_private.album_dedupe_audit(
 album_id uuid not null,
 fotografia_id uuid not null,
 mantida_id uuid not null,
 ordem_original integer not null,
 secao_id uuid,
 relatorio_fotografias jsonb not null default '[]'::jsonb,
 etag text not null,
 retirado_em timestamptz not null default now(),
 primary key(album_id,fotografia_id)
);
revoke all on app_private.album_dedupe_audit from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.pl_prof_album_register_photo(p_album_id uuid, p_caminho text, p_google_id text, p_nome text, p_mime text, p_capturada_em timestamp with time zone DEFAULT NULL::timestamp with time zone, p_largura integer DEFAULT NULL::integer, p_altura integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_job uuid; v_id uuid; v_num integer; v_duplicate uuid;
BEGIN
  IF NOT public.pl_prof_album_can_edit(p_album_id) THEN
    RAISE EXCEPTION 'Sem permissão para importar fotografias';
  END IF;
  SELECT job_principal_id INTO v_job FROM public.albuns WHERE id=p_album_id FOR UPDATE;
  IF p_mime NOT IN ('image/jpeg','image/png','image/webp')
    OR COALESCE(p_nome,'')='' OR LENGTH(p_nome)>240
    OR COALESCE(p_google_id,'')='' OR LENGTH(p_google_id)>500
    OR p_caminho !~ ('^albums/' || p_album_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
    OR COALESCE(p_largura,0)<0 OR COALESCE(p_altura,0)<0
  THEN RAISE EXCEPTION 'Metadados da fotografia inválidos'; END IF;
  SELECT f.id INTO v_id FROM public.fotografias f
    WHERE f.album_origem_id=p_album_id AND f.metadados->>'google_photo_id'=p_google_id
    LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'duplicada',true); END IF;
  v_duplicate := app_private.pl_album_duplicate_by_etag(p_album_id,p_caminho);
  IF v_duplicate IS NOT NULL THEN RETURN jsonb_build_object('id',v_duplicate,'duplicada',true); END IF;
  INSERT INTO public.fotografias
    (album_origem_id,arquivo_caminho,nome_original,capturada_em,largura_px,altura_px,metadados,criado_por)
  VALUES
    (p_album_id,p_caminho,p_nome,p_capturada_em,p_largura,p_altura,
      jsonb_build_object('origem','google_photos','google_photo_id',p_google_id,'mime_type',p_mime),auth.uid())
  RETURNING id INTO v_id;
  SELECT COALESCE(MAX(ordem),0)+1 INTO v_num FROM public.album_fotografias WHERE album_id=p_album_id;
  INSERT INTO public.album_fotografias(album_id,fotografia_id,ordem) VALUES (p_album_id,v_id,v_num);
  INSERT INTO public.fotografia_jobs(fotografia_id,job_id) VALUES(v_id,v_job);
  RETURN jsonb_build_object('id',v_id,'duplicada',false,'numero',v_num);
END;
$function$;

revoke execute on function public.pl_prof_album_register_photo(uuid,text,text,text,text,timestamptz,integer,integer) from public,anon;
grant execute on function public.pl_prof_album_register_photo(uuid,text,text,text,text,timestamptz,integer,integer) to authenticated;
