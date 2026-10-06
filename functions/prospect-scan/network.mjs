import {Buffer} from "node:buffer";

import {resolve4} from 'node:dns/promises';
import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';
import {publicURL,publicIPv4} from '../../prospect.mjs';
// Connect to a validated address, not a second DNS lookup (DNS rebinding protection).
export async function readPublic(value,{timeout=8000,maxBytes=400000}={}){
 const u=publicURL(value);let timer;
 const ips=await Promise.race([resolve4(u.hostname),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Résolution du site trop longue.')),timeout);})]).finally(()=>clearTimeout(timer));
 if(!ips.length||ips.some(ip=>!publicIPv4(ip)))throw Error('Destination réseau refusée.');
 return new Promise((resolve,reject)=>{
  const req=(u.protocol==='https:'?httpsRequest:httpRequest)(u,{agent:false,servername:u.hostname,lookup:(_host,opts,cb)=>opts.all?cb(null,[{address:ips[0],family:4}]):cb(null,ips[0],4),headers:{'User-Agent':'NanayeCRM/1.0 (+https://j-freaz.github.io/atelier-crm/)','Accept':'text/html,text/plain','Accept-Encoding':'identity'}},res=>{
   let size=0,chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(Error('Page trop volumineuse.'));res.destroy();}else chunks.push(chunk);});res.on('error',reject);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text:Buffer.concat(chunks).toString('utf8'),url:u.href}));
  });const deadline=setTimeout(()=>req.destroy(Error('Le site ne répond pas dans le délai prévu.')),timeout);req.on('close',()=>clearTimeout(deadline));req.on('error',reject);req.end();
 });
}
