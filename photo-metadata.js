/* Leitura local de EXIF: não transmite arquivos para terceiros. Sem metadado não inventa data. */
(function(){
 'use strict';
 const MAX_SCAN=12*1024*1024;
 function parseTiff(bytes,base){
  if(base<0||base+8>bytes.length)return null;
  const le=bytes[base]===73&&bytes[base+1]===73&&bytes[base+2]===42&&bytes[base+3]===0;
  const be=bytes[base]===77&&bytes[base+1]===77&&bytes[base+2]===0&&bytes[base+3]===42;
  if(!le&&!be)return null;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=p=>p+2<=bytes.length?view.getUint16(p,le):null;
  const u32=p=>p+4<=bytes.length?view.getUint32(p,le):null;
  const fields={};
  const visited=new Set();
  function ifd(offset,depth){
   if(depth>3||offset===null)return;
   const start=base+offset;
   if(start<base||start+2>bytes.length||visited.has(start))return;
   visited.add(start);
   const num=u16(start);
   if(num===null||num>1500||start+2+num*12>bytes.length)return;
   for(let i=0;i<num;i++){
    const pos=start+2+i*12,tag=u16(pos),type=u16(pos+2),count=u32(pos+4),raw=u32(pos+8);
    if(tag===null||type===null||count===null||raw===null)continue;
    if(tag===0x8769||tag===0x8825){if(type===4&&count===1)ifd(raw,depth+1);continue}
    if(type!==2||count<1||count>100)continue;
    if(![0x9003,0x9004,0x0132,0x9010,0x9011,0x9012].includes(tag))continue;
    const index=count<=4?pos+8:base+raw;
    if(index<base||index+count>bytes.length)continue;
    const chars=[];
    for(let j=0;j<count;j++){const byte=bytes[index+j];if(!byte)break;if(byte<32||byte>126){chars.length=0;break}chars.push(byte)}
    if(chars.length)fields[tag]=String.fromCharCode(...chars).trim();
   }
  }
  ifd(u32(base+4),0);
  const order=[
   {date:fields[0x9003],offset:fields[0x9011],source:'exif_original'},
   {date:fields[0x9004],offset:fields[0x9012],source:'exif_digitizada'},
   {date:fields[0x0132],offset:fields[0x9010],source:'exif_geral'}
  ];
  for(const x of order){
   if(!x.date)continue;
   const m=x.date.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
   if(!m)continue;
   const [year,month,day,hour,minute,second]=m.slice(1).map(Number);
   if(year<1900||year>new Date().getFullYear()+2||month<1||month>12||day<1||day>31||hour>23||minute>59||second>59)continue;
   const check=new Date(Date.UTC(year,month-1,day,hour,minute,second));
   if(check.getUTCFullYear()!==year||check.getUTCMonth()!==month-1||check.getUTCDate()!==day)continue;
   const dateLocal=[m[1],m[2],m[3]].join('-');
   const normalized=[m[1],m[2],m[3]].join('-')+'T'+[m[4],m[5],m[6]].join(':');
   const offset=/^[+-](?:0\d|1\d|2[0-3]):[0-5]\d$/.test(x.offset||'')?x.offset:'';
   const time=offset?new Date(normalized+offset):new Date(year,month-1,day,hour,minute,second);
   if(!Number.isFinite(time.getTime()))continue;
   return {capturadaEm:time.toISOString(),dataOriginalLocal:dateLocal,origem:x.source,temFusoHorario:!!offset};
  }
  return null;
 }
 function scanTiff(bytes){
  for(let i=0;i+8<bytes.length;i++){
   const a=bytes[i],b=bytes[i+1],c=bytes[i+2],d=bytes[i+3];
   if(!((a===73&&b===73&&c===42&&d===0)||(a===77&&b===77&&c===0&&d===42)))continue;
   const x=parseTiff(bytes,i);
   if(x)return x;
  }
  return null;
 }
 function parseJpeg(bytes){
  if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return null;
  let at=2;
  while(at+4<bytes.length){
   if(bytes[at]!==255){at++;continue}
   while(bytes[at]===255)at++;
   const marker=bytes[at++];
   if(marker===0xd9||marker===0xda)break;
   if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
   if(at+2>bytes.length)break;
   const len=bytes[at]*256+bytes[at+1];
   if(len<2||at+len>bytes.length)break;
   if(marker===0xe1&&len>12){
    const st=at+2;
    if(bytes[st]===69&&bytes[st+1]===120&&bytes[st+2]===105&&bytes[st+3]===102){
     const value=parseTiff(bytes,st+6);
     if(value)return value;
    }
   }
   at+=len;
  }
  return null;
 }
 function parsePng(bytes){
  if(bytes.length<12||bytes[0]!==137||bytes[1]!==80||bytes[2]!==78||bytes[3]!==71)return null;
  let pos=8;
  while(pos+12<=bytes.length){
   const len=((bytes[pos]*16777216)+(bytes[pos+1]<<16)+(bytes[pos+2]<<8)+bytes[pos+3])>>>0;
   if(len>MAX_SCAN||pos+len+12>bytes.length)break;
   if(bytes[pos+4]===101&&bytes[pos+5]===88&&bytes[pos+6]===73&&bytes[pos+7]===102){
    return parseTiff(bytes,pos+8);
   }
   pos+=len+12;
  }
  return null;
 }
 function parseWebp(bytes){
  if(bytes.length<20||String.fromCharCode(...bytes.slice(0,4))!=='RIFF'||String.fromCharCode(...bytes.slice(8,12))!=='WEBP')return null;
  let pos=12;
  while(pos+8<=bytes.length){
   const size=(bytes[pos+4]|(bytes[pos+5]<<8)|(bytes[pos+6]<<16)|(bytes[pos+7]<<24))>>>0;
   if(size>MAX_SCAN||pos+8+size>bytes.length)break;
   if(String.fromCharCode(...bytes.slice(pos,pos+4))==='EXIF'){
    const start=pos+8;
    const header=bytes[start]===69&&bytes[start+1]===120&&bytes[start+2]===105&&bytes[start+3]===102;
    return parseTiff(bytes,start+(header?6:0));
   }
   pos+=8+size+(size%2);
  }
  return null;
 }
 async function read(file){
  if(!file||!file.size)return null;
  try{
   const bytes=new Uint8Array(await file.slice(0,Math.min(file.size,MAX_SCAN)).arrayBuffer());
   let result=parseJpeg(bytes)||parsePng(bytes)||parseWebp(bytes);
   if(!result)result=scanTiff(bytes); // HEIC/HEIF may contain an embedded TIFF EXIF item.
   return result;
  }catch(e){console.warn('Metadados de captura não disponíveis',e);return null}
 }
 window.PLPhotoMetadata={read};
})();
