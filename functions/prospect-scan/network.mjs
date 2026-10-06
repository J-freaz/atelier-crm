import {Buffer} from 'node:buffer';
import {resolve4} from 'node:dns/promises';
import {publicURL,publicIPv4} from '../../prospect.mjs';
export function decodeHTTP(bytes,maxBytes=400000){
 const b=Buffer.from(bytes),end=b.indexOf('\r\n\r\n');if(end<0||end>20000)throw Error('Réponse HTTP invalide.');
 const lines=b.subarray(0,end).toString('latin1').split('\r\n'),status=Number(lines.shift().split(' ')[1]);const headers={};
 for(const line of lines){const i=line.indexOf(':');if(i>0)headers[line.slice(0,i).toLowerCase()]=line.slice(i+1).trim();}
 if(headers['content-encoding']&&headers['content-encoding']!=='identity')throw Error('Format de compression non pris en charge.');
 let body=b.subarray(end+4);
 if(headers['transfer-encoding']){
  if(headers['transfer-encoding'].toLowerCase()!=='chunked')throw Error('Transfert HTTP non pris en charge.');
  const chunks=[];let offset=0,total=0,done=false;
  while(offset<body.length){const i=body.indexOf('\r\n',offset);if(i<0)break;const raw=body.subarray(offset,i).toString().split(';')[0];if(!/^[0-9a-f]+$/i.test(raw))throw Error('Réponse HTTP invalide.');const size=parseInt(raw,16);offset=i+2;if(size===0){done=true;break;}total+=size;if(total>maxBytes||offset+size+2>body.length)throw Error('Page tronquée ou trop volumineuse.');chunks.push(body.subarray(offset,offset+size));offset+=size;if(body.subarray(offset,offset+2).toString()!=='\r\n')throw Error('Réponse HTTP invalide.');offset+=2;}
  if(!done)throw Error('Page tronquée.');body=Buffer.concat(chunks);
 }else if(headers['content-length']&&Number(headers['content-length'])!==body.length)throw Error('Page tronquée.');
 if(body.length>maxBytes)throw Error('Page trop volumineuse.');return {status,headers,text:body.toString('utf8')};
}
// DNS address is pinned before connecting; TLS checks the original hostname.
export async function readPublic(value,{timeout=8000,maxBytes=400000}={}){
 const u=publicURL(value);let conn=null,expired=false,timer;
 const work=async()=>{
  const ips=await resolve4(u.hostname);if(expired)throw Error('Délai dépassé.');
  if(!ips.length||ips.some(ip=>!publicIPv4(ip)))throw Error('Destination réseau refusée.');
  conn=await Deno.connect({hostname:ips[0],port:u.protocol==='https:'?443:80});
  if(expired){conn.close();throw Error('Délai dépassé.');}
  if(u.protocol==='https:')conn=await Deno.startTls(conn,{hostname:u.hostname,alpnProtocols:['http/1.1']});
  if(expired){conn.close();throw Error('Délai dépassé.');}
  const request=new TextEncoder().encode(`GET ${u.pathname+u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUser-Agent: NanayeCRM/1.0\r\nAccept: text/html,text/plain\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`);
  for(let sent=0;sent<request.length;){sent+=await conn.write(request.subarray(sent));}
  const chunks=[];let total=0;while(true){const chunk=new Uint8Array(16384),n=await conn.read(chunk);if(n===null)break;total+=n;if(total>maxBytes+40000)throw Error('Page trop volumineuse.');chunks.push(chunk.subarray(0,n));}
  return {...decodeHTTP(Buffer.concat(chunks),maxBytes),url:u.href};
 };
 try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;try{conn?.close();}catch{}reject(Error('Le site ne répond pas dans le délai prévu.'));},timeout);})]);}finally{clearTimeout(timer);try{conn?.close();}catch{}}
}
