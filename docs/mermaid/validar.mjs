import {JSDOM} from "jsdom";
import fs from "fs";
const dom=new JSDOM("<!doctype html><body></body>");
globalThis.window=dom.window;globalThis.document=dom.window.document;
Object.defineProperty(globalThis,"navigator",{value:dom.window.navigator,configurable:true});
for (const k of ["Element","HTMLElement","SVGElement","Node","DOMParser","XMLSerializer","MutationObserver"]) if(dom.window[k]) globalThis[k]=dom.window[k];
const mermaid=(await import("mermaid")).default;
mermaid.initialize({startOnLoad:false});
const md=fs.readFileSync(process.argv[2],"utf8");
const blocks=[...md.matchAll(/```mermaid\n([\s\S]*?)```/g)].map(m=>m[1]);
let bad=0;
for(const [i,b] of blocks.entries()){
  try{await mermaid.parse(b);}catch(e){bad++;console.log("ERRO",i+1,String(e.message||e).slice(0,300));}
}
console.log(blocks.length,"blocos",bad,"com erro");
