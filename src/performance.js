import {parseDate} from './imports.js';
import {valuedPortfolio,portfolioToday} from './income.js';
import {providerSymbol} from './market.js';
const DAY=86400000;
export const reportingDay=portfolioToday;
export const offsetDay=(day,offset)=>new Date(Date.parse(day)+offset*DAY).toISOString().slice(0,10);
export function historicalPrice(data,symbol,asOf,today=reportingDay()){
 const record=data.market?.records?.[providerSymbol(symbol)];
 const manual=data.prices?.[symbol];
 if(asOf===today&&Number.isFinite(manual)&&manual>=0&&(data.market?.enabled===false||data.market?.manualPrices?.[symbol]))return {price:manual,date:today,kind:'manual'};
 const points=[...(record?.history||[]).map(([date,close])=>({date,close})),...(record?.prices||[])];
 if(record?.currency===data.currency&&Number.isFinite(record.price)&&record.price>0&&record.priceDate<=asOf)points.push({date:record.priceDate,close:record.price});
 const eligible=record?.currency===data.currency?points.filter(p=>p.date<=asOf&&Date.parse(asOf)-Date.parse(p.date)<=7*DAY&&Number.isFinite(p.close)&&p.close>0):[];
 const last=eligible.sort((a,b)=>a.date.localeCompare(b.date)).at(-1);
 return last?{price:last.close,date:last.date,kind:'market'}:null;
}
export function datedValuation(data,asOf,today=reportingDay()){
 const subset={...data,trades:(data.trades||[]).filter(t=>t.date<=asOf),holdings:[]};
 const result=valuedPortfolio(subset,asOf),missing=[],priceDates=[];let value=0;
 for(const h of result.holdings){const quote=historicalPrice(data,h.symbol,asOf,today);if(!quote)missing.push(h.symbol);else{value+=h.quantity*quote.price;priceDates.push({symbol:h.symbol,...quote});}}
 return {...result,value:missing.length?null:value,missing:[...new Set(missing)],priceDates};
}
// Reinvested distributions stay inside the securities portfolio. Only the residual
// cash dividend is treated as a cash payout, never both payout and reinvestment.
export function cashDividendFlows(trades){
 const distributions=trades.filter(t=>t.action==='DIVIDEND').map(t=>({...t,left:t.amount}));
 const flows=distributions.map(t=>({date:t.date,amount:t.amount,kind:'cash dividend'}));
 for(const t of trades.filter(t=>t.action==='REINVEST')){
  const cost=t.quantity*t.price+t.fees;
  let inferred=t.amount||cost;
  const candidates=distributions.filter(d=>d.account===t.account&&d.symbol===t.symbol&&d.currency===t.currency&&d.left>0&&Math.abs(Date.parse(d.date)-Date.parse(t.date))<=7*DAY).sort((a,b)=>Math.abs(Date.parse(a.date)-Date.parse(t.date))-Math.abs(Date.parse(b.date)-Date.parse(t.date)));
  for(const d of candidates){const used=Math.min(inferred,d.left);inferred-=used;d.left-=used;if(inferred<=1e-8)break;}
  if(inferred>1e-8&&t.countIncome!==false)flows.push({date:t.date,amount:inferred,kind:'inferred dividend'});
  flows.push({date:t.date,amount:-cost,kind:'reinvestment transfer'});
 }
 return flows;
}
export function portfolioPerformance(data,start,end,today=reportingDay()){
 try{start=parseDate(start);end=parseDate(end);}catch{return {available:false,reason:'Choose valid start and end dates.'};}
 if(start>end)return {available:false,reason:'The start date must be on or before the end date.'};
 if(end>today)return {available:false,reason:'Performance cannot be calculated for a future date.'};
 if(!(data.trades||[]).length)return {available:false,reason:'Dated purchase and sale history is needed for annualised and date-range returns. Holdings snapshots show current value only.'};
 const openingDay=offsetDay(start,-1),opening=datedValuation(data,openingDay,today),closing=datedValuation(data,end,today);
 if(opening.value===null||closing.value===null){
  const missing=[...new Set([...opening.missing,...closing.missing])];
  return {available:false,reason:`Historical closing prices are missing for ${missing.join(', ')} at the selected boundaries. Refresh market data or choose dates covered by the feed.`,missing,opening,closing};
 }
 if(opening.ledger.issues.length||closing.ledger.issues.length)return {available:false,reason:'Resolve incomplete purchase history or currency mismatches before calculating returns.'};
 const flows=[];
 for(const t of closing.projection.trades){
  if(t.date<start||t.date>end||t.currency!==data.currency)continue;
  if(t.action==='BUY')flows.push({date:t.date,amount:-(t.quantity*t.price+t.fees),kind:'purchase'});
  if(t.action==='SELL')flows.push({date:t.date,amount:t.quantity*t.price-t.fees,kind:'sale'});
 }
 for(const flow of cashDividendFlows(closing.projection.trades))if(flow.date>=start&&flow.date<=end)flows.push(flow);
 const effectiveStart=opening.value>1e-8?start:flows.filter(f=>f.kind==='purchase').map(f=>f.date).sort()[0]||start;
 const days=Math.round((Date.parse(end)-Date.parse(effectiveStart))/DAY)+1;
 const profit=closing.value-opening.value+flows.reduce((sum,f)=>sum+f.amount,0);
 // Modified Dietz: purchases add capital and sales/cash distributions withdraw it.
 // Cash flows are weighted from the start of their trade date; dates are inclusive.
 const weightedCapital=opening.value-flows.reduce((sum,f)=>sum+f.amount*(Date.parse(end)-Date.parse(f.date)+DAY)/(days*DAY),0);
 const periodReturn=weightedCapital>1e-8?profit/weightedCapital:null;
 let compoundAnnualReturn=periodReturn!==null&&periodReturn>=-1?Math.pow(1+periodReturn,365/days)-1:null;
 if(!Number.isFinite(compoundAnnualReturn))compoundAnnualReturn=null;
 const annualReturn=periodReturn!==null?periodReturn*365/days:null;
 const income=closing.ledger.dividends-opening.ledger.dividends;
 const capitalReturn=weightedCapital>1e-8?(profit-income)/weightedCapital:null;
 const incomeReturn=weightedCapital>1e-8?income/weightedCapital:null;
 const endBasis=closing.holdings.reduce((sum,h)=>sum+h.quantity*h.cost,0);
 const issues=[...new Set([...opening.projection.issues,...closing.projection.issues])];
 if(weightedCapital<=1e-8)issues.push('No positive time-weighted invested capital is available for this range, so percentage returns cannot be calculated.');
 const relevantSymbols=new Set(closing.projection.trades.map(t=>t.symbol));
 if(data.market?.enabled!==false&&[...relevantSymbols].some(s=>!data.market?.records?.[providerSymbol(s)]?.historyReady))issues.push('Some dividend histories are incomplete; the return may omit distributions.');
 return {available:true,start,end,effectiveStart,days,openingValue:opening.value,closingValue:closing.value,profit,income,capitalGrowth:profit-income,periodReturn,annualReturn,compoundAnnualReturn,capitalReturn,incomeReturn,annualCapitalReturn:capitalReturn!==null?capitalReturn*365/days:null,annualIncomeReturn:incomeReturn!==null?incomeReturn*365/days:null,weightedCapital,endBasis,flows,issues,estimated:closing.projection.events.some(e=>e.status.startsWith('estimated')||e.status==='reinvestment-price-missing'),priceDates:[...opening.priceDates,...closing.priceDates]};
}

export function portfolioValueSeries(data,start,end,today=reportingDay()){
 if(!(data.trades||[]).length||!start||!end||start>end||end>today)return [];
 const length=Math.round((Date.parse(end)-Date.parse(start))/DAY);
 const step=Math.max(1,Math.ceil(length/48)),dates=new Set([start,end]);
 for(let offset=0;offset<=length;offset+=step)dates.add(offsetDay(start,offset));
 const tradeDates=[...new Set((data.trades||[]).map(t=>t.date).filter(d=>d>=start&&d<=end))].sort();
 const tradeStep=Math.max(1,Math.ceil(tradeDates.length/24));
 tradeDates.forEach((d,i)=>{if(i%tradeStep===0)dates.add(d);});
 return [...dates].sort().map(date=>{const valuation=datedValuation(data,date,today);return {date,value:valuation.value};});
}
