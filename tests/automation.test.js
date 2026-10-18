import test from 'node:test';
import assert from 'node:assert/strict';
import {estimateIncome,valuedPortfolio} from '../src/income.js';
import {calculateLedger,readBackup} from '../src/imports.js';
import {cleanMarket,fetchSymbolMarket,priceStatus} from '../src/market.js';
import {initialWorkspace,validateWorkspace,updatePortfolio,WORKSPACE_KEY,LEGACY_KEY,emptyPortfolio} from '../src/portfolios.js';
import {yahooRecord,nasdaqDates} from '../scripts/market-source.mjs';
const buy={id:'b',date:'2025-01-01',action:'BUY',symbol:'TEST',name:'Test',quantity:10,price:100,fees:0,amount:1000,currency:'USD',account:'Broker',source:'CSV'};
const record={symbol:'TEST',currency:'USD',price:120,priceDate:'2025-04-02',quoteTime:'2025-04-02T20:00:00Z',fetchedAt:'2025-04-02T20:10:00Z',prices:[{date:'2025-02-10',close:100},{date:'2025-04-02',close:110}],dividends:[{exDate:'2025-02-01',payDate:'2025-02-10',amount:1},{exDate:'2025-03-25',payDate:'2025-04-02',amount:1}],splits:[]};
const market=(r=record)=>({enabled:true,reinvest:true,records:{TEST:r}});
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('automatic reinvestment compounds and leaves imported trades unchanged',()=>{
 const original=structuredClone(buy);const p=estimateIncome([buy],market(),'2025-04-03');
 assert.equal(p.synthetic.length,2);near(p.events.find(e=>e.exDate==='2025-03-25').eligibleUnits,10.1);
 const l=calculateLedger(p.trades);near(l.holdings[0].quantity,10.1+10.1/110);near(l.dividends,20.1);assert.deepEqual(buy,original);
 assert.deepEqual(estimateIncome([buy],market(),'2025-04-03'),p);
});
test('purchases on the ex-date are excluded; sales on it still receive the dividend',()=>{
 const p=estimateIncome([buy,{...buy,id:'more',date:'2025-02-01',quantity:5},{...buy,id:'sell',action:'SELL',date:'2025-02-01',quantity:4}],market(),'2025-02-11');
 near(p.events[0].eligibleUnits,10);near(p.events[0].gross,10);
});
test('upcoming dividends do not add cash or units early',()=>{
 const p=estimateIncome([buy],market(),'2025-02-05');assert.equal(p.synthetic.length,0);assert.equal(p.events[0].status,'upcoming');
});
test('broker reinvestment replaces the estimate; broker cash is not counted twice',()=>{
 const dividend={...buy,id:'d',date:'2025-02-10',action:'DIVIDEND',quantity:0,price:0,amount:8};
 const drip={...buy,id:'r',date:'2025-02-10',action:'REINVEST',quantity:.08,price:100,amount:8};
 const imported=estimateIncome([buy,dividend,drip],market(),'2025-02-11');assert.equal(imported.synthetic.length,0);near(calculateLedger(imported.trades).dividends,8);
 const assumed=estimateIncome([buy,{...dividend,date:'2025-02-12'}],market(),'2025-02-13');assert.equal(assumed.synthetic.length,1);near(calculateLedger(assumed.trades).dividends,8);
});
test('missing payment dates use a clearly identified ex-date estimate',()=>{
 const r={...record,dividends:[{exDate:'2025-02-01',payDate:null,amount:1}],prices:[{date:'2025-02-01',close:100}]};
 const p=estimateIncome([buy],market(r),'2025-02-03');assert.equal(p.events[0].status,'estimated-drip-exdate');assert.equal(p.events[0].dateEstimated,true);near(p.synthetic[0].quantity,.1);
});
test('missing historical price recognises income without fabricating reinvested shares',()=>{
 const p=estimateIncome([buy],market({...record,prices:[]}),'2025-02-11');assert.equal(p.synthetic[0].action,'DIVIDEND');assert.equal(p.events[0].reinvestedUnits,0);assert.equal(p.issues.length,1);
});
test('cash-only mode and separate accounts preserve correct eligibility',()=>{
 const m={...market(),reinvest:false};const p=estimateIncome([buy,{...buy,account:'Other',quantity:5}],m,'2025-02-11');
 assert.equal(p.events.length,2);near(calculateLedger(p.trades).dividends,15);assert.ok(p.synthetic.every(t=>t.action==='DIVIDEND'));
});
test('public split adjusts units while preserving cost; future dividends use post-split units',()=>{
 const r={...record,splits:[{date:'2025-01-20',ratio:2}]};const p=estimateIncome([buy],market(r),'2025-02-11');
 near(p.events[0].eligibleUnits,20);const l=calculateLedger(p.trades);near(l.holdings[0].quantity,20.2);near(l.holdings[0].quantity*l.holdings[0].cost,1020);
});
test('automatic quote takes precedence only for matching currency and can be disabled',()=>{
 const data={...emptyPortfolio(),trades:[buy],market:market()};near(valuedPortfolio(data,'2025-01-15').holdings[0].price,120);
 data.market.enabled=false;near(valuedPortfolio(data).holdings[0].price,100);
 data.market={...market(),records:{TEST:{...record,currency:'AUD'}}};near(valuedPortfolio(data).holdings[0].price,100);
});
test('stale quotes, failed feeds and symbol mismatches are disclosed',async()=>{
 assert.match(priceStatus(record,Date.parse('2025-04-10')),/stale/);
 assert.match(priceStatus({price:100}),/stale/);
 await assert.rejects(()=>fetchSymbolMarket('TEST',{base:'https://example.com/app/',fetcher:async()=>({ok:false,status:404})}),/no published quote/);
 await assert.rejects(()=>fetchSymbolMarket('TEST',{base:'https://example.com/app/',fetcher:async()=>({ok:true,json:async()=>({...record,symbol:'OTHER'})})}),/did not match/);
 const r=await fetchSymbolMarket('TEST',{base:'https://example.com/app/',fetcher:async url=>{assert.equal(url,'https://example.com/app/market/TEST.json');return {ok:true,json:async()=>record};}});near(r.price,120);
});
test('legacy data migrates; editing one portfolio leaves the other unchanged',()=>{
 const legacy={...emptyPortfolio(),trades:[buy]};const storage={getItem:k=>k===LEGACY_KEY?JSON.stringify(legacy):null};
 const w=initialWorkspace(storage,emptyPortfolio());assert.equal(w.portfolios[0].data.trades.length,1);
 w.portfolios.push({id:'second',name:'Retirement',data:emptyPortfolio()});const next=updatePortfolio(w,'second',{...emptyPortfolio(),currency:'AUD'});
 assert.deepEqual(next.portfolios[0],w.portfolios[0]);assert.equal(next.portfolios[1].data.currency,'AUD');
 const restored=validateWorkspace(JSON.parse(JSON.stringify(next)));assert.equal(restored.portfolios.length,2);
 const stored={getItem:k=>k===WORKSPACE_KEY?JSON.stringify(next):JSON.stringify(legacy)};assert.equal(initialWorkspace(stored,emptyPortfolio()).portfolios.length,2);
});
test('workspace rejects duplicate IDs and backups retain market settings and caches',()=>{
 const d={...emptyPortfolio(),market:market()};const b=readBackup(JSON.stringify({format:'portfolio-desk-backup',version:1,data:d}));assert.equal(b.market.reinvest,true);near(b.market.records.TEST.price,120);
 assert.throws(()=>validateWorkspace({version:1,portfolios:[{id:'x',name:'A',data:d},{id:'x',name:'B',data:d}]}),/unique/);
});
test('Yahoo chart parsing restores split-adjusted historical prices and retains quote timestamps',()=>{
 const ts=s=>Date.parse(s)/1000;
 const body={chart:{result:[{meta:{symbol:'TEST',currency:'USD',regularMarketPrice:120,regularMarketTime:ts('2025-04-02T20:00:00Z')},timestamp:[ts('2025-01-01'),ts('2025-02-01')],indicators:{quote:[{close:[50,110]}]},events:{splits:{s:{date:ts('2025-01-20'),numerator:2,denominator:1}},dividends:{d:{date:ts('2025-01-10'),amount:.5}}}}],error:null}};
 const r=yahooRecord(body,'TEST',{},new Date('2025-04-03'));near(r.prices[0].close,100);near(r.dividends[0].amount,1);assert.equal(r.quoteTime,'2025-04-02T20:00:00.000Z');
 assert.equal(nasdaqDates({data:{dividends:{rows:[{exOrEffDate:'2/1/2025',paymentDate:'02/10/2025'}]}}}).get('2025-02-01'),'2025-02-10');
});

test('broad US directories include non-S&P listings and filter test issues and footers',async()=>{
 const {directorySymbols}=await import('../scripts/market-source.mjs');
 const nasdaq='Symbol|Security Name|Test Issue\nTRMD|Torm|N\nFAKE|Test issue|Y\nFile Creation Time: 20261017|';
 const nyse='ACT Symbol|Security Name|NASDAQ Symbol|Test Issue\nDHT|DHT Holdings|DHT|N\nBRK.B|Berkshire|BRK.B|N';
 assert.deepEqual(directorySymbols(nasdaq).map(s=>s.symbol),['TRMD']);assert.deepEqual(directorySymbols(nyse).map(s=>s.symbol),['DHT','BRK-B']);
});
test('bulk quotes keep per-security timestamps and history availability separate',async()=>{
 const {sparkRecords,publicRecord}=await import('../scripts/market-source.mjs');
 const time=Date.parse('2026-10-16T20:00:00Z')/1000;
 const data={spark:{result:[{symbol:'DHT',response:[{meta:{symbol:'DHT',currency:'USD',regularMarketPrice:12,regularMarketTime:time}}]}]}};
 const [r]=sparkRecords(data);assert.equal(r.symbol,'DHT');assert.equal(r.historyReady,false);assert.equal(r.priceDate,'2026-10-16');
 const projected=publicRecord({...record,prices:[{date:'2025-01-01',close:90},...record.prices]});assert.equal(projected.prices.length,2);assert.equal(projected.dividends.length,2);
});
test('one imported payment cannot suppress two separate estimated dividends',()=>{
 const r={...record,dividends:[{exDate:'2025-02-01',payDate:null,amount:1},{exDate:'2025-03-01',payDate:null,amount:1}],prices:[{date:'2025-02-01',close:100},{date:'2025-03-01',close:100}]};
 const payment={...buy,date:'2025-02-10',action:'REINVEST',quantity:.1,price:100,amount:10};
 const p=estimateIncome([buy,payment],market(r),'2025-03-10');assert.equal(p.events.filter(e=>e.status==='imported').length,1);assert.equal(p.synthetic.filter(t=>t.action==='REINVEST').length,1);
});
test('manual price overrides do not disable dividend estimation or other quotes',()=>{
 const data={...emptyPortfolio(),trades:[buy],prices:{TEST:130},market:{...market(),manualPrices:{TEST:true}}};
 const result=valuedPortfolio(data,'2025-02-11');near(result.holdings[0].price,130);assert.equal(result.projection.synthetic.length,1);
});
