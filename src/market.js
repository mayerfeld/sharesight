import {parseDate} from './imports.js';
const day=s=>parseDate(s);
const positive=n=>Number.isFinite(Number(n))&&Number(n)>0;
export const providerSymbol=symbol=>symbol.toUpperCase().replaceAll('.','-');
export function cleanMarket(value){
 const market={enabled:value?.enabled!==false,reinvest:value?.reinvest!==false,records:{},...(value?.manualPrices?{manualPrices:Object.fromEntries(Object.entries(value.manualPrices).filter(([symbol,manual])=>/^[A-Z0-9.-]{1,25}$/.test(symbol)&&manual===true))}:{})};
 for(const [symbol,r] of Object.entries(value?.records||{})){
  if(!/^[A-Z0-9.-]{1,25}$/.test(symbol)||!['USD','AUD','GBP','EUR'].includes(r?.currency))continue;
  try{
   const record={symbol,currency:r.currency,source:'Yahoo Finance (public chart)',historyReady:r.historyReady===true,historyFetchedAt:r.historyFetchedAt||null,sector:String(r.sector||'Imported securities'),prices:(r.prices||[]).map(p=>({date:day(p.date),close:Number(p.close)})).filter(p=>positive(p.close)),dividends:(r.dividends||[]).map(d=>({exDate:day(d.exDate),payDate:d.payDate?day(d.payDate):null,amount:Number(d.amount)})).filter(d=>positive(d.amount)),splits:(r.splits||[]).map(s=>({date:day(s.date),ratio:Number(s.ratio)})).filter(s=>positive(s.ratio))};
   if(positive(r.price)){record.price=Number(r.price);record.priceDate=day(r.priceDate);}
   for(const field of ['fetchedAt','quoteTime'])if(Number.isFinite(Date.parse(r[field])))record[field]=r[field];
   market.records[symbol]=record;
  }catch{/* Discard invalid public cache entries, preserving imported trades. */}
 }
 return market;
}
export function marketSymbols(data){return [...new Set([...(data.trades||[]).map(t=>t.symbol),...(data.holdings||[]).map(h=>h.symbol)])].sort();}
export async function fetchSymbolMarket(symbol,{fetcher=fetch,base=document.baseURI}={}){
 const ticker=providerSymbol(symbol);
 if(!/^[A-Z0-9-]{1,25}$/.test(ticker))throw new Error(`${symbol}: automatic feed currently covers US-listed stocks and ETFs.`);
 let response;
 try{response=await fetcher(new URL(`market/${encodeURIComponent(ticker)}.json`,base).href,{signal:AbortSignal.timeout(15000),cache:'no-store',credentials:'omit'});}catch{throw new Error(`${symbol}: market feed could not be reached; cached prices are retained.`);}
 if(!response.ok)throw new Error(`${symbol}: no published quote available. The feed may still be building, or the ticker may be outside its coverage.`);
 let body;try{body=await response.json();}catch{throw new Error(`${symbol}: the market feed is unavailable.`);}
 if(body.symbol!==ticker)throw new Error(`${symbol}: quote response did not match this ticker.`);
 const record=cleanMarket({records:{[ticker]:body}}).records[ticker];
 if(!record?.price||!record.fetchedAt||!record.quoteTime)throw new Error(`${symbol}: the feed returned no valid timestamped price.`);
 return record;
}
export function marketRecord(data,symbol){return data.market?.records?.[providerSymbol(symbol)];}
export function priceStatus(record,now=Date.now()){
 if(!record?.price)return 'No automatic quote';
 return !Number.isFinite(Date.parse(record.fetchedAt))||!Number.isFinite(Date.parse(record.quoteTime))||now-Date.parse(record.fetchedAt)>4*3600000||now-Date.parse(record.quoteTime)>4*86400000?'Cached / stale quote':'Scheduled market quote';
}
