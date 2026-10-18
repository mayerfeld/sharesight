import {readBackup} from './imports.js';
export const WORKSPACE_KEY='portfolio-desk-workspace-v1';
export const LEGACY_KEY='portfolio-desk-v1';
export const emptyPortfolio=()=>({currency:'USD',demo:false,holdings:[],trades:[],prices:{},market:{enabled:true,reinvest:true,records:{}}});
export function portfolioId(){return globalThis.crypto?.randomUUID?.()||`portfolio-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
export function portfolioName(value){const name=String(value||'').trim();if(!name||name.length>80)throw new Error('Enter a portfolio name between 1 and 80 characters.');return name;}
export function validateWorkspace(value){
 if(value?.version!==1||!Array.isArray(value.portfolios)||!value.portfolios.length||value.portfolios.length>100)throw new Error('Invalid portfolio workspace.');
 const ids=new Set();
 const portfolios=value.portfolios.map(p=>{
  if(typeof p.id!=='string'||!p.id||ids.has(p.id))throw new Error('Portfolio IDs must be unique.');ids.add(p.id);
  return {id:p.id,name:portfolioName(p.name),data:readBackup(JSON.stringify({format:'portfolio-desk-backup',version:1,data:p.data}))};
 });
 return {version:1,activeId:ids.has(value.activeId)?value.activeId:portfolios[0].id,portfolios};
}
export function initialWorkspace(storage,fallback){
 const saved=storage.getItem(WORKSPACE_KEY);
 if(saved)return validateWorkspace(JSON.parse(saved));
 const legacy=storage.getItem(LEGACY_KEY);
 let data=fallback;
 if(legacy)data=readBackup(JSON.stringify({format:'portfolio-desk-backup',version:1,data:{trades:[],prices:{},...JSON.parse(legacy)}}));
 return {version:1,activeId:'original',portfolios:[{id:'original',name:'My portfolio',data}]};
}
export function updatePortfolio(workspace,id,data){return {...workspace,portfolios:workspace.portfolios.map(p=>p.id===id?{...p,data}:p)};}
