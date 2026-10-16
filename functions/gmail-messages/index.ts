import {createMailHandler} from './handler.mjs';
// Release explicitly approved; set NANAYE_GMAIL_SEND_ENABLED=false to suspend sending.
Deno.serve(createMailHandler({env:(name:string)=>name==='NANAYE_GMAIL_SEND_ENABLED'?(Deno.env.get(name)||'true'):Deno.env.get(name)}));
