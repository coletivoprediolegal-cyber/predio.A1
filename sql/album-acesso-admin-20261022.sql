-- Permite que administradores ativos vejam e editem albuns privados, fotos e miniaturas,
-- preservando a protecao dos albuns de demonstracao comuns.
DO $migration$
DECLARE r record; d text; original text;
BEGIN
 FOR r IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname = ANY(ARRAY['pl_album_foto_atualizar_profissional','pl_album_foto_registrar','pl_album_foto_registrar_dedupe','pl_album_fotos_profissionais','pl_album_membros_profissionais','pl_album_organizar_profissional','pl_album_secoes_profissionais','pl_demo_job_contents','pl_foto_autorizada','pl_registrar_miniatura','pl_report_album_edit']) LOOP
  original:=pg_get_functiondef(r.oid); d:=original;
  IF r.proname IN ('pl_album_membros_profissionais','pl_album_secoes_profissionais') THEN
   d:=replace(d, ' IF EXISTS(SELECT 1 FROM public.albuns WHERE id=p_album_id AND observacoes LIKE ''[PRIVADO]%'' AND criado_por IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION ''Álbum privado não autorizado'' USING ERRCODE=''42501'';END IF;'||chr(10), '');
  ELSIF r.proname='pl_foto_autorizada' THEN
   d:=replace(d,'a.criado_por is distinct from auth.uid() or not app_private.is_admin()','not app_private.is_admin()');
  ELSIF r.proname='pl_report_album_edit' THEN
   d:=replace(d,'criado_por is distinct from auth.uid() or not app_private.is_admin()','not app_private.is_admin()');
  ELSE
   d:=replace(d,'a.criado_por=auth.uid() AND app_private.is_admin()','app_private.is_admin()');
   d:=replace(d,'a.criado_por=auth.uid() and app_private.is_admin()','app_private.is_admin()');
   d:=replace(d,'a.criado_por=(SELECT auth.uid()) AND app_private.is_admin()','app_private.is_admin()');
   d:=replace(d,'a.criado_por=auth.uid()','app_private.is_admin()');
  END IF;
  IF d=original THEN RAISE EXCEPTION 'Sem substituição: %',r.proname; END IF;
  EXECUTE d;
 END LOOP;
END $migration$;
ALTER POLICY pl_storage_admin_insert_2026 ON storage.objects WITH CHECK (bucket_id='predio-legal-fotos' AND app_private.is_admin() AND (storage.foldername(name))[1] IN (SELECT a.id::text FROM public.albuns a JOIN public.jobs j ON j.id=a.job_principal_id JOIN public.clientes c ON c.id=j.cliente_principal_id WHERE c.nome NOT LIKE '% (DEMO)' OR a.observacoes LIKE '[PRIVADO]%'));
ALTER POLICY pl_storage_admin_delete_2026 ON storage.objects USING (bucket_id='predio-legal-fotos' AND app_private.is_admin() AND (storage.foldername(name))[1] IN (SELECT a.id::text FROM public.albuns a JOIN public.jobs j ON j.id=a.job_principal_id JOIN public.clientes c ON c.id=j.cliente_principal_id WHERE c.nome NOT LIKE '% (DEMO)' OR a.observacoes LIKE '[PRIVADO]%'));
