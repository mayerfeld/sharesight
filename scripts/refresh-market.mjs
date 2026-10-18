import {mkdir,readFile,writeFile} from 'node:fs/promises';
import Papa from 'papaparse';
import {yahooRecord,nasdaqDates,directorySymbols,sparkRecords,publicRecord} from './market-source.mjs';
const cache='.market-cache',output='public/market';
await mkdir(cache,{recursive:true});await mkdir(output,{recursive:true});
const headers={'User-Agent':'Mozilla/5.0 (compatible; PortfolioDesk market refresh)','Accept':'application/json'};
async function get(url){const r=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r;}
const commonETFs=['VTI','VXUS','BND','SPY','QQQ','VT','VOO','IWM','SCHD','VIG','VEA','VWO','AGG','GLD','TLT','ARKK'];
// Public market categories, never imported account data or portfolio quantities.
const shipping=['TRMD','DHT','FRO','STNG','TNK','INSW','ECO','ASC','DAC','ZIM','SBLK','GNK','SB','NAT','NMM','CMRE','GLNG','GSL','DSX','PANL','TK','SFL','BWLP','GASS','HAFN','LPG'];
const universe=new Map([...commonETFs.map(symbol=>({symbol,sector:'ETF',priority:true})),...shipping.map(symbol=>({symbol,sector:'Marine transportation',priority:true}))].map(item=>[item.symbol,item]));
try{
 const csv=await (await get('https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv')).text();
 for(const row of Papa.parse(csv,{header:true,skipEmptyLines:true}).data)if(/^[A-Z0-9.-]+$/.test(row.Symbol))universe.set(row.Symbol.replaceAll('.','-'),{symbol:row.Symbol.replaceAll('.','-'),sector:row['GICS Sector'],name:row.Security,priority:true});
}catch{/* Cached directory below remains available. */}
let directories=0;
for(const name of ['nasdaqlisted','otherlisted'])try{
 const text=await (await get(`https://www.nasdaqtrader.com/dynamic/SymDir/${name}.txt`)).text();
 for(const item of directorySymbols(text))if(!universe.has(item.symbol))universe.set(item.symbol,item);
 directories++;
}catch{/* Retain cached directory entries if a directory is unavailable. */}
if(!directories)try{for(const item of JSON.parse(await readFile(`${cache}/universe.json`,'utf8')))if(!universe.has(item.symbol))universe.set(item.symbol,item);}catch{}
await writeFile(`${cache}/universe.json`,JSON.stringify([...universe.values()]));
const records={};
for(const item of universe.values())try{records[item.symbol]=JSON.parse(await readFile(`${cache}/${item.symbol}.json`,'utf8'));}catch{}
async function save(record){
 const item=universe.get(record.symbol)||{};record={...record,sector:item.sector||record.sector,name:item.name||record.name||record.symbol};records[record.symbol]=record;
 await writeFile(`${cache}/${record.symbol}.json`,JSON.stringify(record));await writeFile(`${output}/${record.symbol}.json`,JSON.stringify(publicRecord(record)));
}
const symbols=[...universe.keys()],batches=[];
for(let i=0;i<symbols.length;i+=20)batches.push(symbols.slice(i,i+20));
let index=0,quotes=0;const failedBatches=[];
async function bulk(){while(index<batches.length){const batch=batches[index++];try{
 const url=`https://query1.finance.yahoo.com/v7/finance/spark?symbols=${encodeURIComponent(batch.join(','))}&range=1d&interval=1d`;
 for(const r of sparkRecords(await (await get(url)).json(),records)){await save(r);quotes++;}
 }catch{failedBatches.push(...batch);}await new Promise(resolve=>setTimeout(resolve,300));}}
await Promise.all([bulk(),bulk(),bulk()]);
// Refresh the primary universe each run and rotate through the broader listing
// catalog. All symbols get bulk quotes; dividend-history coverage is disclosed separately.
let cursor=0;try{cursor=Number(JSON.parse(await readFile(`${cache}/cursor.json`,'utf8')))||0;}catch{}
const extra=[...universe.values()].filter(item=>!item.priority),rotating=[];
for(let i=0;i<Math.min(250,extra.length);i++)rotating.push(extra[(cursor+i)%extra.length]);
await writeFile(`${cache}/cursor.json`,JSON.stringify(extra.length?(cursor+rotating.length)%extra.length:0));
const tasks=[...[...universe.values()].filter(item=>item.priority),...rotating];index=0;let histories=0;const failures=[];
async function history(){while(index<tasks.length){const item=tasks[index++],symbol=item.symbol,previous=records[symbol];try{
 const now=new Date(),start=previous?.prices?.length?Math.max(Date.parse(previous.prices.at(-1).date)/1000-45*86400,0):Math.floor(now.getTime()/1000)-10*366*86400;
 const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${Math.floor(start)}&period2=${Math.floor(now.getTime()/1000)}&interval=1d&events=div%2Csplits`;
 const record={...yahooRecord(await (await get(url)).json(),symbol,previous,now),historyReady:true,historyFetchedAt:now.toISOString(),paymentDatesCheckedAt:previous?.paymentDatesCheckedAt};
 if(record.dividends.some(d=>!d.payDate)&&(!previous?.paymentDatesCheckedAt||now-Date.parse(previous.paymentDatesCheckedAt)>7*86400000))try{
 const dates=nasdaqDates(await (await get(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/dividends?assetclass=stocks`)).json());record.dividends=record.dividends.map(d=>({...d,payDate:dates.get(d.exDate)||d.payDate}));record.paymentDatesCheckedAt=now.toISOString();
 }catch{}
 await save(record);histories++;
 }catch{failures.push(symbol);}await new Promise(resolve=>setTimeout(resolve,600));}}
await Promise.all([history(),history(),history()]);
// Re-publish retained records as well; an unavailable source must not erase history.
for(const record of Object.values(records))await writeFile(`${output}/${record.symbol}.json`,JSON.stringify(publicRecord(record)));
await writeFile(`${output}/manifest.json`,JSON.stringify({generatedAt:new Date().toISOString(),source:'Yahoo Finance public charts; Nasdaq payment dates where available',coverage:'Nasdaq/NYSE/other US listings, common ETFs and marine-transportation stocks',quotesRefreshed:quotes,historiesRefreshed:histories,historyPending:symbols.filter(s=>!records[s]?.historyReady).length,published:Object.keys(records).length,quoteBatchFailures:failedBatches.length,historyFailures:failures,total:symbols.length}));
console.log(`Market feed: ${quotes} quotes, ${histories} histories refreshed, ${Object.keys(records).length}/${symbols.length} symbols published.`);
if(!Object.keys(records).length)process.exitCode=1;
