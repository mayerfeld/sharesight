import {mkdir,readFile,writeFile} from 'node:fs/promises';
import Papa from 'papaparse';
import {yahooRecord,nasdaqDates} from './market-source.mjs';
const cache='.market-cache',output='public/market';
await mkdir(cache,{recursive:true});await mkdir(output,{recursive:true});
const headers={'User-Agent':'Mozilla/5.0 (compatible; PortfolioDesk market refresh)','Accept':'application/json'};
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r;}
const universe=new Map(['VTI','VXUS','BND','SPY','QQQ','VT','VOO','IWM','SCHD','VIG','VEA','VWO','AGG','GLD','TLT','ARKK'].map(symbol=>[symbol,{symbol,sector:'ETF'}]));
try{
 const csv=await (await get('https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv')).text();
 for(const row of Papa.parse(csv,{header:true,skipEmptyLines:true}).data)if(/^[A-Z0-9.-]+$/.test(row.Symbol))universe.set(row.Symbol.replaceAll('.','-'),{symbol:row.Symbol.replaceAll('.','-'),sector:row['GICS Sector'],name:row.Security});
 await writeFile(`${cache}/universe.json`,JSON.stringify([...universe.values()]));
}catch{
 try{for(const item of JSON.parse(await readFile(`${cache}/universe.json`,'utf8')))universe.set(item.symbol,item);}catch{/* ETFs remain available if the constituents source is unavailable. */}
}
const tasks=[...universe.values()];let position=0,fresh=0,retained=0;const failures=[];
async function worker(){
 while(position<tasks.length){
  const item=tasks[position++],symbol=item.symbol;let previous;
  try{previous=JSON.parse(await readFile(`${cache}/${symbol}.json`,'utf8'));}catch{}
  try{
   const now=new Date();const start=previous?.prices?.length?Math.max(Date.parse(previous.prices.at(-1).date)/1000-45*86400,0):Math.floor(now.getTime()/1000)-10*366*86400;
   const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${Math.floor(start)}&period2=${Math.floor(now.getTime()/1000)}&interval=1d&events=div%2Csplits`;
   const record={...yahooRecord(await (await get(url)).json(),symbol,previous,now),sector:item.sector,name:item.name||symbol};
   if(record.dividends.some(d=>!d.payDate)&&(!previous?.paymentDatesCheckedAt||now-Date.parse(previous.paymentDatesCheckedAt)>7*86400000)){
    try{
     const dates=nasdaqDates(await (await get(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/dividends?assetclass=stocks`)).json());
     record.dividends=record.dividends.map(d=>({...d,payDate:dates.get(d.exDate)||d.payDate}));record.paymentDatesCheckedAt=now.toISOString();
    }catch{/* Ex-date fallback is explicitly labelled as an estimate by the client. */}
   }
   await writeFile(`${cache}/${symbol}.json`,JSON.stringify(record));
   await writeFile(`${output}/${symbol}.json`,JSON.stringify(record));fresh++;
  }catch{
   failures.push(symbol);
   if(previous){await writeFile(`${output}/${symbol}.json`,JSON.stringify(previous));retained++;}
  }
  // Keep request volume modest; provider failures never overwrite cached quotes.
  await new Promise(resolve=>setTimeout(resolve,800));
 }
}
await Promise.all([worker(),worker()]);
await writeFile(`${output}/manifest.json`,JSON.stringify({generatedAt:new Date().toISOString(),source:'Yahoo Finance public charts; Nasdaq payment dates where available',coverage:'S&P 500 stocks and common ETFs',fresh,retained,failed:failures,total:tasks.length}));
console.log(`Market feed: ${fresh} refreshed, ${retained} retained, ${failures.length} unavailable.`);
if(!fresh&&!retained)process.exitCode=1;
