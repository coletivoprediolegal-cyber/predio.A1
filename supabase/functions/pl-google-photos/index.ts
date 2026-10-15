// Google Photos Picker proxy + one-photo-at-a-time private import.
// Google OAuth token is supplied per request and never persisted by this function.
import { createClient } from "jsr:@supabase/supabase-js@2.57.0";

const ORIGINS = new Set([
  "https://coletivoprediolegal-cyber.github.io",
  "http://localhost:8000", "http://localhost:3000", "http://127.0.0.1:8000"
]);
const API = "https://photospicker.googleapis.com/v1";
const MAX_BYTES = 40 * 1024 * 1024;
function reply(data: unknown, code = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status: code, headers: {
      "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://coletivoprediolegal-cyber.github.io",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Vary": "Origin"
    }
  });
}
function fail(message: string, code = 400, origin = "") { return reply({error: message}, code, origin); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function validId(value: unknown) { return typeof value==="string" && value.length>0 && value.length<=500; }
Deno.serve(async (req) => {
  const origin=req.headers.get("origin")||"";
  if(req.method==="OPTIONS") return reply({},200,origin);
  if(req.method!=="POST") return fail("Método não permitido",405,origin);
  if(origin && !ORIGINS.has(origin)) return fail("Origem não autorizada",403,origin);
  const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!jwt) return fail("Entre no Prédio Legal antes de importar fotos",401,origin);
  const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  const sb=createClient(supabaseUrl,anon,{global:{headers:{Authorization:"Bearer "+jwt}},auth:{autoRefreshToken:false,persistSession:false}});
  const {data:{user},error:userError}=await sb.auth.getUser(jwt);
  if(userError||!user) return fail("Sessão expirada; entre novamente",401,origin);
  let data:any;
  try{data=await req.json()}catch{return fail("Solicitação inválida",400,origin)}
  const {action,googleToken}=data||{};
  if(typeof googleToken!=="string" || googleToken.length<30 || googleToken.length>5000)
    return fail("Autorize o acesso ao Google Fotos",401,origin);
  const headers={Authorization:"Bearer "+googleToken};
  const google=async (path:string,method="GET",body?:object)=>{
    const res=await fetch(API+path,{method,headers:{...headers,...(body?{"Content-Type":"application/json"}:{})},body:body?JSON.stringify(body):undefined});
    if(!res.ok) {
      const msg=(await res.text()).slice(0,1000);
      if(res.status===401) throw new Error("Autorização do Google Fotos expirada. Reconecte sua conta.");
      if(res.status===403) throw new Error("Acesso negado pelo Google Fotos. Ative a Google Photos Picker API no Google Cloud e autorize o escopo solicitado.");
      throw new Error("Google Fotos ("+res.status+"): "+msg.slice(0,250));
    }
    return res.status===204?{}:await res.json();
  };
  try{
    if(action==="create")return reply(await google("/sessions","POST",{pickingConfig:{maxItemCount:"2000"}}),200,origin);
    if(action==="status"){
      if(!validId(data.sessionId)) return fail("Sessão inválida",400,origin);
      return reply(await google("/sessions/"+encodeURIComponent(data.sessionId)),200,origin);
    }
    if(action==="list"){
      if(!validId(data.sessionId))return fail("Sessão inválida",400,origin);
      const params=new URLSearchParams({sessionId:data.sessionId,pageSize:"100"});
      if(data.pageToken)params.set("pageToken",String(data.pageToken).slice(0,3000));
      return reply(await google("/mediaItems?"+params),200,origin);
    }
    if(action==="cleanup"){
      if(!validId(data.sessionId))return fail("Sessão inválida",400,origin);
      await google("/sessions/"+encodeURIComponent(data.sessionId),"DELETE");
      return reply({ok:true},200,origin);
    }
    if(action==="import"){
      const albumId=data.albumId;
      const item=data.item;
      if(!UUID.test(String(albumId||"")) || !item || item.type!=="PHOTO" || !validId(item.id))
        return fail("Álbum ou fotografia inválidos",400,origin);
      const {data:allowed,error:permissionError}=await sb.rpc("pl_prof_album_can_edit",{p_album_id:albumId});
      if(permissionError||allowed!==true)return fail("Sem permissão para editar este álbum",403,origin);
      const info=item.mediaFile||{},mime=String(info.mimeType||"").toLowerCase();
      const ext=({"image/jpeg":"jpg","image/png":"png","image/webp":"webp"} as Record<string,string>)[mime];
      if(!ext)return fail("Formato ainda não suportado: "+mime+". Use JPEG, PNG ou WebP.",415,origin);
      const rawUrl=String(info.baseUrl||"");
      let url:URL;
      try{url=new URL(rawUrl)}catch{return fail("Endereço da fotografia inválido",400,origin)}
      if(url.protocol!=="https:" || !/^[a-z0-9-]+\.googleusercontent\.com$/.test(url.hostname))
        return fail("Origem da imagem não autorizada",400,origin);
      // A URL expira em cerca de 60 min. =d mantém os pixels originais, retirando EXIF de localização.
      const download=await fetch(rawUrl+"=d",{headers});
      if(!download.ok)throw new Error("Falha ao baixar fotografia do Google ("+download.status+")");
      const declared=Number(download.headers.get("content-length")||"0");
      if(declared>MAX_BYTES)return fail("Imagem com mais de 40 MB. Importe este arquivo separadamente.",413,origin);
      const bytes=await download.arrayBuffer();
      if(!bytes.byteLength || bytes.byteLength>MAX_BYTES)return fail("Imagem vazia ou maior que 40 MB",413,origin);
      const photoPath="albums/"+albumId+"/"+crypto.randomUUID()+"."+ext;
      if(!service)throw new Error("Serviço de armazenamento não configurado");
      const admin=createClient(supabaseUrl,service,{auth:{autoRefreshToken:false,persistSession:false}});
      const {error:uploadError}=await admin.storage.from("predio-legal-fotos").upload(
        photoPath,bytes,{contentType:mime,upsert:false,cacheControl:"3600"}
      );
      if(uploadError)throw new Error("Armazenamento: "+uploadError.message);
      const {data:registered,error:registerError}=await sb.rpc("pl_prof_album_register_photo",{
        p_album_id:albumId,p_caminho:photoPath,p_google_id:item.id,
        p_nome:String(info.filename||"foto."+ext).slice(0,240),
        p_mime:mime,p_capturada_em:item.createTime||null,
        p_largura:info.mediaFileMetadata?.width||null,
        p_altura:info.mediaFileMetadata?.height||null
      });
      if(registerError||!registered){
        await admin.storage.from("predio-legal-fotos").remove([photoPath]);
        throw new Error("Não foi possível registrar a fotografia: "+(registerError?.message||"sem resposta"));
      }
      if(registered.duplicada)await admin.storage.from("predio-legal-fotos").remove([photoPath]);
      return reply({ok:true,duplicada:!!registered.duplicada,numero:registered.numero},200,origin);
    }
    return fail("Operação desconhecida",400,origin);
  }catch(e){return fail(e instanceof Error?e.message:"Erro de importação",502,origin)}
});