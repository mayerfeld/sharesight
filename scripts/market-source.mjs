const iso=seconds=>new Date(seconds*1000).toISOString().slice(0,10);
const finite=n=>Number.isFinite(Number(n))&&Number(n)>0;
export function yahooRecord(body,symbol,previous={},now=new Date()){
 const result=body?.chart?.result?.[0];
 if(!result||body.chart.error)throw new Error('Market source returned no security data.');
 const meta=result.meta||{};
 if(String(meta.symbol||'').toUpperCase()!==symbol.toUpperCase())throw new Error('Market response symbol mismatch.');
 if(!finite(meta.regularMarketPrice)||!finite(meta.regularMarketTime))throw new Error('Market source returned no timestamped quote.');
 const splits=Object.values(result.events?.splits||{}).map(s=>({date:iso(s.date),ratio:Number(s.numerator)/Number(s.denominator)})).filter(s=>finite(s.ratio)&&s.ratio!==1);
 const allSplits=[...new Map([...(previous.splits||[]),...splits].map(s=>[s.date,s])).values()].sort((a,b)=>a.date.localeCompare(b.date));
 // Yahoo historical closes and dividends are split-adjusted. Restore contemporaneous
 // values before replaying the actual split events against the investor's share count.
 const futureFactor=day=>allSplits.filter(s=>s.date>day).reduce((p,s)=>p*s.ratio,1);
 const closes=result.indicators?.quote?.[0]?.close||[];
 const prices=(result.timestamp||[]).map((t,i)=>({date:iso(t),close:Number(closes[i])*futureFactor(iso(t))})).filter(p=>finite(p.close));
 const dividends=Object.values(result.events?.dividends||{}).map(d=>({exDate:iso(d.date),payDate:null,amount:Number(d.amount)*futureFactor(iso(d.date))})).filter(d=>finite(d.amount));
 const prior=new Map((previous.dividends||[]).map(d=>[d.exDate,d]));
 for(const d of dividends)prior.set(d.exDate,{...d,payDate:prior.get(d.exDate)?.payDate||null});
 return {symbol,currency:meta.currency,price:Number(meta.regularMarketPrice),priceDate:iso(meta.regularMarketTime),quoteTime:new Date(meta.regularMarketTime*1000).toISOString(),fetchedAt:now.toISOString(),source:'Yahoo Finance (public chart)',prices:[...new Map([...(previous.prices||[]),...prices].map(p=>[p.date,p])).values()].sort((a,b)=>a.date.localeCompare(b.date)),dividends:[...prior.values()].sort((a,b)=>a.exDate.localeCompare(b.exDate)),splits:allSplits};
}
export function nasdaqDates(body){
 const usDate=s=>{const m=String(s||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`:null;};
 return new Map((body?.data?.dividends?.rows||[]).map(r=>[usDate(r.exOrEffDate),usDate(r.paymentDate)]).filter(([ex,pay])=>ex&&pay));
}

export function directorySymbols(text){
 const lines=text.trim().split(/\r?\n/),headers=lines.shift().split('|');
 const index=names=>names.map(n=>headers.indexOf(n)).find(n=>n>=0);
 const symbolIndex=index(['NASDAQ Symbol','Symbol','ACT Symbol']),nameIndex=index(['Security Name']),testIndex=index(['Test Issue']);
 if(symbolIndex===undefined)throw new Error('Unrecognised public symbol directory.');
 return lines.map(line=>line.split('|')).filter(row=>(testIndex===undefined||row[testIndex]==='N')&&/^[A-Z][A-Z0-9.-]{0,14}$/.test(row[symbolIndex]||'')).map(row=>({symbol:row[symbolIndex].replaceAll('.','-'),name:row[nameIndex]||row[symbolIndex],sector:'US-listed security'}));
}
export function sparkRecords(body,previous={},now=new Date()){
 if(!Array.isArray(body?.spark?.result))throw new Error('Bulk quote source returned no results.');
 return body.spark.result.flatMap(item=>{
  const result=item.response?.[0],meta=result?.meta;
  if(!meta||!finite(meta.regularMarketPrice)||!finite(meta.regularMarketTime)||meta.symbol!==item.symbol)return [];
  return [{...previous[item.symbol],symbol:item.symbol,currency:meta.currency,price:Number(meta.regularMarketPrice),priceDate:iso(meta.regularMarketTime),quoteTime:new Date(meta.regularMarketTime*1000).toISOString(),fetchedAt:now.toISOString(),source:'Yahoo Finance (public chart)',prices:previous[item.symbol]?.prices||[],dividends:previous[item.symbol]?.dividends||[],splits:previous[item.symbol]?.splits||[],historyReady:previous[item.symbol]?.historyReady===true}];
 });
}
export function publicRecord(record){
 const wanted=new Set();
 for(const dividend of record.dividends||[]){
  const target=dividend.payDate||dividend.exDate;
  const points=(record.prices||[]).filter(p=>p.date<=target&&Date.parse(target)-Date.parse(p.date)<=7*86400000);
  if(points.length)wanted.add(points.at(-1).date);
 }
 return {...record,prices:(record.prices||[]).filter(p=>wanted.has(p.date))};
}
