import Papa from 'papaparse';
import {validateHolding} from './portfolio.js';
import {cleanMarket} from './market.js';
export const CSV_COLUMNS = ['id','date','action','symbol','name','quantity','price','fees','amount','currency','account','source'];
const aliases = {
  date:['date','trade date','transaction date','run date','transaction trade date','transactiondate'],
  action:['action','transaction','transaction type','type','activity','activity type','transaction description','transactiontype','trade type'],
  symbol:['symbol','ticker','investment code','security symbol','stock symbol','code','investment'],
  name:['name','description','security description','investment name','security name'],
  quantity:['quantity','qty','shares','units','number of shares','quantity shares','numberofshares'],
  price:['price','price per share','price $','share price','unit price','price per unit','price aud','price usd','pricepershare'],
  fees:['fees','commission','commission $','commissions','commission fees','commissions and fees','brokerage','brokerage fees','transaction fees','brokerage $'],
  amount:['amount','amount $','net amount','net amount $','net cash','total','total amount','proceeds','net proceeds','netamount','value'],
  currency:['currency','currency code','instrument currency'], feeCurrency:['brokerage currency'], account:['account','account number','account name','portfolio','portfolio name'],
  id:['id','transaction id','transactionid','trade id','reference number','confirmation number'], source:['source','broker']
};
const key=s=>String(s||'').replace(/^\uFEFF/,'').toLowerCase().replace(/[_()]/g,' ').replace(/\s+/g,' ').trim();
export function numeric(value, fallback=0) {
  if(value===undefined || String(value).trim()==='' || String(value).trim()==='--') return fallback;
  const s=String(value).trim().replace(/[,$£€\s]/g,'').replace(/^\((.*)\)$/,'-$1');
  if(!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) throw new Error(`Invalid number: ${value}`);
  const n=Number(s);if(!Number.isFinite(n))throw new Error('Number is too large.');return n;
}
export function parseDate(value, dateOrder='MDY') {
  const s=String(value||'').trim().replace(/\s+as of\s+.*$/i,'');
  let y,m,d,match=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if(match)[,y,m,d]=match;
  else if((match=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/))){
    y=Number(match[3]); if(y<100)y+=2000;
    [m,d]=dateOrder==='DMY'?[match[2],match[1]]:[match[1],match[2]];
  } else {
    match=s.match(/^(\d{1,2})[ -]([A-Za-z]{3,9})[ ,-]+(\d{4})$/);
    if(match){d=match[1];m=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].slice(0,3).toLowerCase())+1;y=match[3];}
    else throw new Error(`Unrecognised date: ${s || '(blank)'}`);
  }
  y=Number(y);m=Number(m);d=Number(d);const t=new Date(Date.UTC(y,m-1,d));
  if(y<1900||y>2200||t.getUTCFullYear()!==y||t.getUTCMonth()!==m-1||t.getUTCDate()!==d)throw new Error(`Invalid date: ${s}`);
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
export function actionType(value){
  const s=key(value);
  if(/cancel|reversal|short|cover|option|expired|exercise|capital gain|cap gain|return of capital/.test(s))throw new Error(`Activity requires manual review: ${value}`);
  if(/reinvest/.test(s)) return 'REINVEST';
  if(/dividend|distribution|div\b/.test(s))return 'DIVIDEND';
  if(/\bsell\b|\bsold\b|\bsale\b|redemption/.test(s))return 'SELL';
  if(/\bbuy\b|\bbought\b|purchase/.test(s))return 'BUY';
  throw new Error(`Unsupported activity: ${String(value || '(blank)').slice(0,90)}. Transfers, splits and cash activity require review.`);
}
export function validateTrade(t){
  if(!['BUY','SELL','DIVIDEND','REINVEST'].includes(t.action))throw new Error('Unsupported trade action.');
  const out={id:String(t.id||''),date:parseDate(t.date),action:t.action,symbol:String(t.symbol||'').trim().toUpperCase(),name:String(t.name||t.symbol||'').trim(),quantity:numeric(t.quantity),price:numeric(t.price),fees:numeric(t.fees),amount:numeric(t.amount),currency:String(t.currency||'USD').toUpperCase(),account:String(t.account||'Default').trim(),source:String(t.source||'CSV').trim()};
  if(!/^[A-Z0-9.^:/-]{1,25}$/.test(out.symbol))throw new Error('A valid ticker symbol is required.');
  if(!/^[A-Z]{3}$/.test(out.currency))throw new Error('Currency must be a three-letter code.');
  if(out.quantity<0||out.price<0||out.fees<0||out.amount<0)throw new Error('Normalised trade numbers must be non-negative.');
  if(out.action!=='DIVIDEND' && (out.quantity<=0||out.price<=0))throw new Error('Trades require positive units and price.');
  if(out.action==='DIVIDEND'&&out.amount<=0)throw new Error('Dividends require a positive cash amount.');
  return out;
}
export function parseImport(text,{source='Auto-detect',currency='USD',account='Default',dateOrder='MDY'}={}) {
  const raw=Array.isArray(text)?{data:text,errors:[]}:Papa.parse(text,{skipEmptyLines:'greedy'});
  if(raw.errors.length)throw new Error(raw.errors[0].message);
  const headerIndex=raw.data.findIndex(row=>row.some(c=>aliases.symbol.includes(key(c)))&&row.some(c=>[...aliases.action,...aliases.quantity].includes(key(c))));
  if(headerIndex<0)throw new Error('No supported table header found. Use a transaction or holdings export, select another worksheet, or download our template.');
  const headers=raw.data[headerIndex].map(key);
  const positions=Object.fromEntries(Object.entries(aliases).map(([field,names])=>[field,headers.findIndex(h=>names.includes(h))]));
  let broker=source;
  if(source==='Auto-detect')broker=headers.includes('run date')?'Fidelity':headers.includes('transaction description')?'Vanguard':headers.includes('transactiondate')?'E*TRADE':headers.includes('brokerage')&&(headers.includes('trade date')||headers.includes('market code'))?'Sharesight':'CSV';
  const isHoldings=positions.action<0;
  if(isHoldings && !headers.includes('cost'))throw new Error('This looks like a positions export. Import transaction history, or use our holdings template with cost and price.');
  const rows=[],errors=[];let reportTotalsSkipped=0;
  for(let i=headerIndex+1;i<raw.data.length;i++){
    const cells=raw.data[i];
    if(cells.every(c=>!String(c).trim()))continue;
    const get=f=>positions[f]>=0?cells[positions[f]]:undefined;
    if (/^(?:grand )?(?:sub)?total(?:s)?(?::)?$/i.test(String(get('symbol')||'').trim()) && !String(get('action')||'').trim() && !String(get('date')||'').trim()) {reportTotalsSkipped++;continue;}
    // Broker exports sometimes append explanatory prose; show every rejected row for review.
    try{
      if(isHoldings){
        const r=Object.fromEntries(headers.map((h,j)=>[h,cells[j]]));
        rows.push(validateHolding({...r,symbol:get('symbol'),name:get('name'),quantity:r.quantity,price:r.price,cost:r.cost,dividends:r.dividends ?? 0}));
      }else{
        const action=actionType(get('action'));
        const quantity=Math.abs(numeric(get('quantity')));
        const feeColumns=headers.map((h,j)=>/^(fees|commission|commission \$|commissions|commission fees|commissions and fees|brokerage|brokerage fees|brokerage \$|transaction fees|fees \$)$/.test(h)?j:-1).filter(j=>j>=0);
        const fees=feeColumns.reduce((sum,j)=>sum+Math.abs(numeric(cells[j])),0);
        const amount=Math.abs(numeric(get('amount')));
        const tradeCurrency=String(get('currency')||currency).trim().toUpperCase();
        const feeCurrency=String(get('feeCurrency')||tradeCurrency).trim().toUpperCase();
        if(fees && feeCurrency!==tradeCurrency)throw new Error(`Brokerage currency ${feeCurrency} differs from instrument currency ${tradeCurrency}. Convert the brokerage fee before importing.`);
        let price=Math.abs(numeric(get('price')));
        if(!price&&quantity&&amount&&action!=='DIVIDEND')price=(action==='SELL'?amount+fees:amount-fees)/quantity;
        rows.push(validateTrade({id:get('id'),date:parseDate(get('date'),dateOrder),action,symbol:get('symbol'),name:get('name'),quantity:action==='DIVIDEND'?0:quantity,price:action==='DIVIDEND'?0:price,fees,amount:action==='DIVIDEND'?amount:(action==='SELL'?quantity*price-fees:quantity*price+fees),currency:tradeCurrency,account:get('account')||account,source:get('source')||broker}));
      }
    }catch(e){errors.push({row:i+1,message:e.message});}
  }
  if(!rows.length&&!errors.length)throw new Error('No data rows found.');
  return {kind:isHoldings?'holdings':'trades',source:broker,rows,errors,...(reportTotalsSkipped?{reportTotalsSkipped}:{})};
}
// Count matching rows rather than collapsing all equal trades: two genuine identical fills remain two fills.
function fingerprint(t){return JSON.stringify([t.account,t.currency,t.date,t.action,t.symbol,t.quantity,t.price,t.fees,t.amount]);}
export function mergeTrades(existing,incoming){
  const available=new Map(),seen=new Map(),ids=new Map();
  const stableKey=t=>JSON.stringify([t.account,t.source,t.id]);
  for(const t of existing){
    if(t.id)ids.set(stableKey(t),t);
    else {const k=fingerprint(t);available.set(k,(available.get(k)||0)+1);}
  }
  const added=[],conflicts=[];let duplicates=0;
  for(const t of incoming){
    if(t.id){
      const k=stableKey(t),match=ids.get(k);
      if(match){if(fingerprint(match)!==fingerprint(t))conflicts.push({id:t.id,message:`Transaction ${t.id} changed. Restore a backup or reconcile it before importing.`});else duplicates++;}
      else {ids.set(k,t);added.push(t);}
    }else{
      const k=fingerprint(t),n=(seen.get(k)||0)+1;seen.set(k,n);
      if(n<=(available.get(k)||0))duplicates++;else added.push(t);
    }
  }
  return {trades:[...existing,...added],added:added.length,duplicates,conflicts};
}
export function calculateLedger(trades,prices={},currency='USD') {
  const positions=new Map();let realised=0;const issues=[];
  const dividendPool=new Map();
  const dividendKey=t=>JSON.stringify([t.account,t.symbol,t.currency]);
  for(const t of trades)if(t.action==='DIVIDEND'){const k=dividendKey(t);const entries=dividendPool.get(k)||[];entries.push({date:t.date,left:t.amount});dividendPool.set(k,entries);}
  const sorted=trades.map((t,index)=>({...t,index})).sort((a,b)=>a.date.localeCompare(b.date)||(a.action==='SPLIT'?-1:b.action==='SPLIT'?1:0)||a.index-b.index);
  for(const t of sorted){
    if(t.currency!==currency){issues.push(`${t.symbol}: ${t.currency} differs from reporting currency ${currency}.`);continue;}
    const k=JSON.stringify([t.account,t.symbol]);
    const p=positions.get(k)||{symbol:t.symbol,name:t.name,sector:'Imported securities',account:t.account,quantity:0,basis:0,dividends:0,lastPrice:0,realised:0,boughtUnits:0,reinvestedUnits:0,soldUnits:0,cashPurchases:0,reinvestedCost:0};
    if(t.action==='SPLIT'){p.quantity*=t.ratio;p.boughtUnits*=t.ratio;p.reinvestedUnits*=t.ratio;p.soldUnits*=t.ratio;p.lastPrice/=t.ratio;}else if(t.action==='BUY'||t.action==='REINVEST'){
      if(t.action==='BUY'){p.boughtUnits+=t.quantity;p.cashPurchases+=t.quantity*t.price+t.fees;}else{p.reinvestedUnits+=t.quantity;p.reinvestedCost+=t.quantity*t.price+t.fees;}
      p.quantity+=t.quantity;p.basis+=t.quantity*t.price+t.fees;p.lastPrice=t.price;
      if(t.action==='REINVEST'&&t.countIncome!==false){
        let unmatched=t.amount||t.quantity*t.price+t.fees;
        const entries=(dividendPool.get(dividendKey(t))||[]).filter(d=>d.left>0&&Math.abs(Date.parse(d.date)-Date.parse(t.date))<=7*86400000).sort((a,b)=>Math.abs(Date.parse(a.date)-Date.parse(t.date))-Math.abs(Date.parse(b.date)-Date.parse(t.date)));
        for(const d of entries){const matched=Math.min(d.left,unmatched);d.left-=matched;unmatched-=matched;if(unmatched<=1e-8)break;}
        p.dividends+=unmatched;
      }
    }else if(t.action==='SELL'){
      if(t.quantity>p.quantity+1e-8){issues.push(`${t.date} ${t.symbol}: sale exceeds available units in ${t.account}. Import earlier purchases first.`);continue;}
      p.soldUnits+=t.quantity;
      const removed=p.quantity?p.basis*t.quantity/p.quantity:0;
      const gain=t.quantity*t.price-t.fees-removed;p.realised+=gain;realised+=gain;p.basis=Math.max(0,p.basis-removed);p.quantity=Math.max(0,p.quantity-t.quantity);p.lastPrice=t.price;
    }else if(t.action==='DIVIDEND')p.dividends+=t.amount;
    positions.set(k,p);
  }
  const holdings=[...positions.values()].filter(p=>p.quantity>1e-8).map(p=>({symbol:p.symbol,name:p.name,sector:p.sector,quantity:p.quantity,cost:p.basis/p.quantity,price:prices[p.symbol]??p.lastPrice,dividends:p.dividends,account:p.account,boughtUnits:p.boughtUnits,reinvestedUnits:p.reinvestedUnits,soldUnits:p.soldUnits,cashPurchases:p.cashPurchases,reinvestedCost:p.reinvestedCost,realisedGain:p.realised}));
  return {holdings,realised,dividends:[...positions.values()].reduce((s,p)=>s+p.dividends,0),issues};
}
export function readBackup(text){
  const b=JSON.parse(text);
  if(b.format!=='portfolio-desk-backup'||b.version!==1||!b.data)throw new Error('Not a supported Portfolio Desk backup.');
  const d=b.data;
  if(!['USD','AUD','GBP','EUR'].includes(d.currency)||!Array.isArray(d.holdings)||!Array.isArray(d.trades))throw new Error('Invalid backup contents.');
  const prices=Object.create(null);for(const [symbol,p] of Object.entries(d.prices||{})){if(!Number.isFinite(p)||p<0)throw new Error('Invalid saved price.');prices[symbol]=p;}
  return {currency:d.currency,holdings:d.holdings.map(validateHolding),trades:d.trades.map(validateTrade),prices,demo:!!d.demo,...(d.market?{market:cleanMarket(d.market)}:{})};
}
