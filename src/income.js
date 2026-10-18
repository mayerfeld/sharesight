import {calculateLedger,parseDate} from './imports.js';
import {providerSymbol} from './market.js';
const DAY=86400000;
const positionKey=(account,symbol)=>JSON.stringify([account,symbol]);
const cleanDay=day=>parseDate(day);
export function portfolioToday(now=new Date()){const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));return `${parts.year}-${parts.month}-${parts.day}`;}
export function estimateIncome(trades,market,today=portfolioToday()) {
  today=cleanDay(today);
  const records=market?.records||{},reinvest=market?.reinvest!==false;
  const synthetic=[],events=[],issues=[];
  const accounts=new Map();
  for(const t of trades){const k=positionKey(t.account,t.symbol);if(!accounts.has(k))accounts.set(k,{account:t.account,symbol:t.symbol,name:t.name,currency:t.currency});}
  for(const position of accounts.values()){
    const {account,symbol,currency}=position,k=positionKey(account,symbol);
    const history=trades.filter(t=>positionKey(t.account,t.symbol)===k).sort((a,b)=>a.date.localeCompare(b.date));
    const record=records[providerSymbol(symbol)];
    if(!record||currency!==record.currency)continue;
    const scheduled=[],usedIncome=new Set();
    for(const split of record.splits||[])if(split.date>history[0].date&&split.date<=today){const t={id:`split:${symbol}:${account}:${split.date}`,date:split.date,action:'SPLIT',ratio:split.ratio,symbol,account,currency,quantity:0,price:0,fees:0,amount:0,source:'Public market split'};synthetic.push(t);scheduled.push(t);}
    const candidates=(record.dividends||[]).filter(d=>d.exDate>=history[0].date&&d.exDate<=today).sort((a,b)=>a.exDate.localeCompare(b.exDate));
    for(const d of candidates){
      const eligibleTrades=[...history,...scheduled].filter(t=>(t.date<d.exDate||t.action==='SPLIT'&&t.date===d.exDate)&&t.action!=='DIVIDEND').sort((a,b)=>a.date.localeCompare(b.date)||(a.action==='SPLIT'?-1:b.action==='SPLIT'?1:0));
      const units=eligibleTrades.reduce((sum,t)=>t.action==='SPLIT'?sum*t.ratio:sum+(t.action==='SELL'?-t.quantity:t.quantity),0);
      if(units<=1e-8)continue;
      const payment=d.payDate||d.exDate;
      // Match broker income near the payment date, including entries booked a few days later.
      const target=payment||d.exDate;
      const available=history.map((t,index)=>({...t,index})).filter(t=>!usedIncome.has(t.index)&&['DIVIDEND','REINVEST'].includes(t.action)&&(d.payDate?Math.abs(Date.parse(t.date)-Date.parse(target))<=7*DAY:t.date>=d.exDate&&Date.parse(t.date)-Date.parse(d.exDate)<=45*DAY));
      const gross=units*d.amount;
      const ranked=[...available].sort((a,b)=>Math.abs(a.amount-gross)-Math.abs(b.amount-gross)||Math.abs(Date.parse(a.date)-Date.parse(target))-Math.abs(Date.parse(b.date)-Date.parse(target)));
      const cashEntry=ranked.find(t=>t.action==='DIVIDEND');
      const reinvestEntry=ranked.find(t=>t.action==='REINVEST'&&(!cashEntry||Math.abs(Date.parse(t.date)-Date.parse(cashEntry.date))<=7*DAY));
      const matches=[cashEntry,reinvestEntry].filter(Boolean);
      for(const t of matches)usedIncome.add(t.index);
      const importedReinvest=matches.some(t=>t.action==='REINVEST');
      const importedIncome=matches.some(t=>t.action==='DIVIDEND');
      const event={symbol,account,exDate:d.exDate,payDate:payment,perShare:d.amount,eligibleUnits:units,gross,reinvestedUnits:0,currency,dateEstimated:!d.payDate,status:'estimated',price:null,priceDate:null};
      if(importedReinvest){event.gross=reinvestEntry.amount;event.status='imported';event.reinvestedUnits=matches.filter(t=>t.action==='REINVEST').reduce((s,t)=>s+t.quantity,0);events.push(event);continue;}
      if(payment>today){event.status=payment?'upcoming':'payment-date-missing';events.push(event);continue;}
      const cash=importedIncome?matches.filter(t=>t.action==='DIVIDEND').reduce((s,t)=>s+t.amount,0):gross;
      const base={id:`estimate:${symbol}:${account}:${d.exDate}`,date:payment,symbol,name:position.name,quantity:0,price:0,fees:0,amount:cash,currency,account,source:'Estimated market dividend'};
      if(!reinvest){
        if(!importedIncome){synthetic.push({...base,action:'DIVIDEND'});scheduled.push({...base,action:'DIVIDEND'});}
        event.status=importedIncome?'imported-cash':'estimated-cash';events.push(event);continue;
      }
      const prices=(record.prices||[]).filter(p=>p.date<=payment&&Date.parse(payment)-Date.parse(p.date)<=7*DAY&&p.close>0).sort((a,b)=>a.date.localeCompare(b.date));
      const price=prices.at(-1);
      if(!price){
        if(!importedIncome)synthetic.push({...base,action:'DIVIDEND'});
        event.status='reinvestment-price-missing';issues.push(`${symbol} ${payment}: dividend income estimated, but reinvestment awaits a historical price.`);events.push(event);continue;
      }
      const estimate={...base,action:'REINVEST',price:price.close,quantity:cash/price.close,countIncome:!importedIncome};
      synthetic.push(estimate);scheduled.push(estimate);
      event.gross=cash;event.reinvestedUnits=estimate.quantity;event.price=price.close;event.priceDate=price.date;
      event.status=importedIncome?'estimated-drip-imported-cash':!d.payDate?'estimated-drip-exdate':price.date===payment?'estimated-drip':'estimated-drip-prior-close';events.push(event);
    }
  }
  return {trades:[...trades,...synthetic],synthetic,events:events.sort((a,b)=>(b.payDate||b.exDate).localeCompare(a.payDate||a.exDate)),issues};
}
export function valuedPortfolio(data,today) {
  const active=data.market?.enabled!==false;
  const prices={...data.prices};
  if(active)for(const h of [...(data.holdings||[]),...(data.trades||[])]){const r=data.market?.records?.[providerSymbol(h.symbol)];if(!data.market?.manualPrices?.[h.symbol]&&r?.currency===data.currency&&Number.isFinite(r.price)&&r.price>0)prices[h.symbol]=r.price;}
  const asOf=today||portfolioToday();
  const datedTrades=(data.trades||[]).filter(t=>t.date<=asOf);
  const projection=active?estimateIncome(datedTrades,data.market,asOf):{trades:datedTrades,synthetic:[],events:[],issues:[]};
  const ledger=calculateLedger(projection.trades,prices,data.currency);
  const holdings=(data.trades||[]).length?ledger.holdings:(data.holdings||[]).map(h=>({...h,price:prices[h.symbol]??h.price}));
  for(const h of holdings){const record=data.market?.records?.[providerSymbol(h.symbol)];if(active&&record?.sector)h.sector=record.sector;}
  return {holdings,ledger,projection};
}
