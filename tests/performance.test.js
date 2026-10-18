import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioPerformance,cashDividendFlows,reportingDay} from '../src/performance.js';
import {calculateLedger} from '../src/imports.js';
import {emptyPortfolio} from '../src/portfolios.js';
const buy={id:'b',date:'2025-01-01',action:'BUY',symbol:'TEST',name:'Example',quantity:100,price:10,fees:0,amount:1000,currency:'USD',account:'Broker',source:'CSV'};
const drip={...buy,id:'r',date:'2025-07-01',action:'REINVEST',quantity:10,amount:100};
const dividend={...drip,id:'d',action:'DIVIDEND',quantity:0,price:0};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function data(trades=[buy,drip],history=[['2024-12-31',10],['2025-07-01',10],['2025-12-31',11]]){
 return {...emptyPortfolio(),trades,market:{enabled:true,reinvest:true,records:{TEST:{currency:'USD',price:11,priceDate:'2025-12-31',history,prices:history.map(([date,close])=>({date,close})),dividends:[],splits:[],historyReady:true}}}};
}
test('reinvested shares have nonzero basis and lifetime unit breakdown',()=>{
 const h=calculateLedger([buy,drip]).holdings[0];near(h.quantity,110);near(h.quantity*h.cost,1100);near(h.cost,10);near(h.boughtUnits,100);near(h.reinvestedUnits,10);near(h.cashPurchases,1000);near(h.reinvestedCost,100);
 const sold=calculateLedger([buy,drip,{...buy,id:'s',action:'SELL',date:'2025-08-01',quantity:20,price:11}]).holdings[0];near(sold.quantity,90);near(sold.quantity*sold.cost,900);near(sold.soldUnits,20);
});
test('annual total return counts reinvested income once, not as zero-cost shares or new capital',()=>{
 const r=portfolioPerformance(data(),'2025-01-01','2025-12-31','2025-12-31');
 assert.equal(r.available,true);near(r.closingValue,1210);near(r.endBasis,1100);near(r.income,100);near(r.capitalGrowth,110);near(r.profit,210);near(r.periodReturn,.21);near(r.annualReturn,.21);assert.equal(r.days,365);
 const explicit=portfolioPerformance(data([buy,dividend,drip]),'2025-01-01','2025-12-31','2025-12-31');near(explicit.profit,210);near(explicit.income,100);near(explicit.periodReturn,.21);
});
test('cash dividends contribute to return without adding units',()=>{
 const r=portfolioPerformance(data([buy,dividend]),'2025-01-01','2025-12-31','2025-12-31');near(r.closingValue,1100);near(r.profit,200);near(r.weightedCapital,1000-100*184/365);near(r.periodReturn,200/(1000-100*184/365));near(r.income,100);
});
test('custom range uses opening market value, not original purchase cost',()=>{
 const r=portfolioPerformance(data(),'2025-07-02','2025-12-31','2025-12-31');near(r.openingValue,1100);near(r.closingValue,1210);near(r.profit,110);near(r.periodReturn,.1);near(r.income,0);assert.equal(r.days,183);
});
test('Modified Dietz weights an additional purchase according to its date',()=>{
 const trades=[{...buy,date:'2024-12-01'},{...buy,id:'b2',date:'2025-01-06',quantity:50,amount:500}];
 const d=data(trades,[['2024-12-31',10],['2025-01-10',11]]);d.market.records.TEST.priceDate='2025-01-10';
 const r=portfolioPerformance(d,'2025-01-01','2025-01-10','2025-01-10');near(r.openingValue,1000);near(r.closingValue,1650);near(r.weightedCapital,1250);near(r.periodReturn,.12);near(r.profit,150);
});
test('sale proceeds enter performance even when the position has been fully sold',()=>{
 const d=data([buy,{...buy,id:'s',date:'2025-12-31',action:'SELL',price:12,amount:1200}]);const r=portfolioPerformance(d,'2025-01-01','2025-12-31','2025-12-31');near(r.closingValue,0);near(r.profit,200);assert.ok(r.periodReturn>0);
});
test('missing boundary prices, snapshots and invalid/future date ranges do not invent returns',()=>{
 const d=data();assert.equal(portfolioPerformance(d,'2025-05-01','2025-06-01','2025-12-31').available,false);
 assert.equal(portfolioPerformance(emptyPortfolio(),'2025-01-01','2025-12-31','2025-12-31').available,false);
 assert.equal(portfolioPerformance(d,'2025-12-31','2025-01-01','2025-12-31').available,false);
 assert.equal(portfolioPerformance(d,'2025-01-01','2026-01-01','2025-12-31').available,false);
});
test('different-day cash dividend and DRIP are not double-counted and respect range boundaries',()=>{
 const cash={...dividend,date:'2025-06-30'},reinvest={...drip,date:'2025-07-02'};
 near(calculateLedger([buy,cash,reinvest]).dividends,100);
 const flows=cashDividendFlows([buy,cash,reinvest]);near(flows.reduce((s,f)=>s+f.amount,0),0);assert.ok(flows.some(f=>f.date==='2025-07-02'&&f.amount===-100));
 const d=data([buy,cash,reinvest],[['2025-07-01',10],['2025-07-02',10]]);d.market.records.TEST.price=10;d.market.records.TEST.priceDate='2025-07-02';
 const r=portfolioPerformance(d,'2025-07-02','2025-07-02','2025-07-02');near(r.openingValue,1000);near(r.closingValue,1100);near(r.profit,0);
});
test('split-adjusted unit breakdown stays reconciled and fallback prices adjust for the split',()=>{
 const split={...buy,date:'2025-08-01',action:'SPLIT',ratio:2};const h=calculateLedger([buy,drip,split]).holdings[0];near(h.quantity,220);near(h.boughtUnits,200);near(h.reinvestedUnits,20);near(h.quantity*h.cost,1100);near(h.price,5);
});
test('reporting day uses New York rather than the host UTC day',()=>{assert.equal(reportingDay(new Date('2026-01-02T01:00:00Z')),'2026-01-01');});
test('simple annualisation is linear and capital/income rates reconcile',()=>{
 const trades=[{...buy,date:'2024-12-01'},{...buy,id:'b2',date:'2025-01-06',quantity:50,amount:500}];
 const d=data(trades,[['2024-12-31',10],['2025-01-10',11]]);d.market.records.TEST.priceDate='2025-01-10';
 const r=portfolioPerformance(d,'2025-01-01','2025-01-10','2025-01-10');near(r.annualReturn,4.38);near(r.annualCapitalReturn+r.annualIncomeReturn,r.annualReturn);
});
test('value graph uses source prices and retains missing-data gaps',async()=>{
 const {portfolioValueSeries}=await import('../src/performance.js');
 const points=portfolioValueSeries(data(),'2025-01-01','2025-12-31','2025-12-31');assert.equal(points[0].date,'2025-01-01');near(points[0].value,1000);near(points.at(-1).value,1210);assert.ok(points.some(p=>p.value===null));assert.ok(points.length<80);
});
test('backup validation preserves compact historical price data',async()=>{
 const {readBackup}=await import('../src/imports.js');
 const d=data();const restored=readBackup(JSON.stringify({format:'portfolio-desk-backup',version:1,data:d}));assert.deepEqual(restored.market.records.TEST.history,d.market.records.TEST.history);
});
test('nonpositive time-weighted capital leaves percentage returns unavailable',()=>{
 const d=data([{...buy,date:'2024-12-01'},{...buy,id:'s',date:'2025-01-01',action:'SELL',amount:1000}],[['2024-12-31',10],['2025-01-01',10]]);
 const r=portfolioPerformance(d,'2025-01-01','2025-01-01','2025-01-01');assert.equal(r.periodReturn,null);assert.equal(r.annualReturn,null);assert.ok(r.issues.some(s=>s.includes('time-weighted')));
});
