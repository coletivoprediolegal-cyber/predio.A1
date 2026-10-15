-- Álbum profissional e importação fotográfica: acesso por vínculo com job.
CREATE OR REPLACE FUNCTION public.pl_prof_album_can_edit(p_album_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
SELECT EXISTS (
  SELECT 1 FROM public.albuns a
  JOIN public.perfis_acesso p ON p.usuario_id = (SELECT auth.uid())
  WHERE a.id = p_album_id AND p.ativo IS TRUE
    AND p.papel IN ('administrador','colaborador')
    AND a.job_principal_id IS NOT NULL
    AND app_private.can_view_job(a.job_principal_id)
    AND COALESCE(a.observacoes,'') NOT LIKE '[DEMO]%'
);
$$;

CREATE OR REPLACE FUNCTION public.pl_prof_album_create(
  p_job_id uuid, p_titulo text, p_data date, p_assunto text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_album uuid; v_empreendimento uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.perfis_acesso p
    WHERE p.usuario_id=auth.uid() AND p.ativo AND p.papel IN ('administrador','colaborador')
  ) OR NOT app_private.can_view_job(p_job_id) THEN
    RAISE EXCEPTION 'Sem autorização para criar álbuns neste job';
  END IF;
  IF LENGTH(BTRIM(COALESCE(p_titulo,''))) < 3 OR LENGTH(p_titulo)>150
     OR LENGTH(COALESCE(p_assunto,''))>300 OR p_data IS NULL
     OR p_data > CURRENT_DATE + 7 THEN RAISE EXCEPTION 'Dados do álbum inválidos'; END IF;
  SELECT j.empreendimento_id INTO v_empreendimento
  FROM public.jobs j
  WHERE j.id=p_job_id AND COALESCE(j.descricao,'') NOT LIKE '[DEMO]%';
  IF NOT FOUND THEN RAISE EXCEPTION 'Job não disponível para este tipo de álbum'; END IF;
  INSERT INTO public.albuns(titulo,data_vistoria,assunto,empreendimento_id,job_principal_id,criado_por)
  VALUES (BTRIM(p_titulo),p_data,NULLIF(BTRIM(p_assunto),''),v_empreendimento,p_job_id,auth.uid())
  RETURNING id INTO v_album;
  INSERT INTO public.album_jobs(album_id,job_id) VALUES(v_album,p_job_id);
  RETURN v_album;
END;
$$;

CREATE OR REPLACE FUNCTION public.pl_prof_album_register_photo(
  p_album_id uuid, p_caminho text, p_google_id text, p_nome text,
  p_mime text, p_capturada_em timestamptz DEFAULT NULL,
  p_largura integer DEFAULT NULL, p_altura integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_job uuid; v_id uuid; v_num integer;
BEGIN
  IF NOT public.pl_prof_album_can_edit(p_album_id) THEN
    RAISE EXCEPTION 'Sem permissão para importar fotografias';
  END IF;
  SELECT job_principal_id INTO v_job FROM public.albuns WHERE id=p_album_id;
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
$$;

CREATE OR REPLACE FUNCTION public.pl_prof_album_info(p_album_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
SELECT COALESCE((
  SELECT jsonb_build_object(
    'id',a.id,'titulo',a.titulo,'assunto',a.assunto,'data',a.data_vistoria,
    'job_id',a.job_principal_id,
    'pode_editar',public.pl_prof_album_can_edit(a.id),
    'fotos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',f.id,'numero',af.ordem,'nome',f.nome_original,
        'caminho',f.arquivo_caminho,'capturada_em',f.capturada_em,
        'destaque',f.destaque,'anomalia',f.nivel_anomalia
      ) ORDER BY af.ordem)
      FROM public.album_fotografias af JOIN public.fotografias f ON f.id=af.fotografia_id
      WHERE af.album_id=a.id AND f.excluida_em IS NULL
    ),'[]'::jsonb))
  FROM public.albuns a
  WHERE a.id=p_album_id AND a.job_principal_id IS NOT NULL
    AND app_private.can_view_job(a.job_principal_id)
    AND COALESCE(a.observacoes,'') NOT LIKE '[DEMO]%'
),'{}'::jsonb)
$$;

REVOKE ALL ON FUNCTION public.pl_prof_album_can_edit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pl_prof_album_create(uuid,text,date,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pl_prof_album_register_photo(uuid,text,text,text,text,timestamptz,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pl_prof_album_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pl_prof_album_can_edit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pl_prof_album_create(uuid,text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pl_prof_album_register_photo(uuid,text,text,text,text,timestamptz,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pl_prof_album_info(uuid) TO authenticated;

DROP POLICY IF EXISTS album_links_scoped_read_v2 ON public.album_fotografias;
CREATE POLICY album_links_scoped_read_v2 ON public.album_fotografias
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.albuns a
    WHERE a.id=album_fotografias.album_id AND a.job_principal_id IS NOT NULL
    AND app_private.can_view_job(a.job_principal_id))
);
