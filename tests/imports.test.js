import test from 'node:test';
import assert from 'node:assert/strict';
import Papa from 'papaparse';
import {parseImport,mergeTrades,calculateLedger,readBackup,parseDate,CSV_COLUMNS} from '../src/imports.js';
import {summarize} from '../src/portfolio.js';
const csv='date,action,symbol,name,quantity,price,fees,amount,currency,account,id\n2025-01-01,BUY,VTI,Vanguard,10,100,2,-1002,USD,Taxable,a\n2025-02-01,SELL,VTI,Vanguard,4,120,1,479,USD,Taxable,b\n2025-03-01,DIVIDEND,VTI,Vanguard,0,0,0,10,USD,Taxable,c';
const trades=()=>parseImport(csv).rows;
test('fees, sale basis, realised gains, dividends and manual valuation',()=>{
 const parsed=parseImport(csv);assert.deepEqual(parsed.errors,[]);
 const ledger=calculateLedger(parsed.rows,{VTI:130});assert.deepEqual(ledger.issues,[]);
 assert.equal(ledger.holdings[0].quantity,6);assert.ok(Math.abs(ledger.holdings[0].cost-100.2)<1e-9);
 assert.ok(Math.abs(ledger.realised-78.2)<1e-9);assert.equal(ledger.dividends,10);
 assert.equal(summarize(ledger.holdings).value,780);
});
test('repeated and overlapping imports do not duplicate trades',()=>{
 const a=trades();const first=mergeTrades([],a);assert.equal(first.added,3);
 const again=mergeTrades(first.trades,a);assert.equal(again.added,0);assert.equal(again.duplicates,3);
 const overlap=mergeTrades(a,a.slice(1));assert.equal(overlap.trades.length,3);
 const next={...a[0],id:'next',date:'2025-04-01'};assert.equal(mergeTrades(a,[...a,next]).added,1);
});
test('changed transaction with a stable ID is flagged',()=>{
 const a=trades();assert.equal(mergeTrades(a,[{...a[0],quantity:20}]).conflicts.length,1);
});
test('identical legitimate fills retain their multiplicity across reimports',()=>{
 const t={...trades()[0],id:''};const first=mergeTrades([],[t,t]);assert.equal(first.trades.length,2);
 const second=mergeTrades(first.trades,[t,t]);assert.equal(second.added,0);assert.equal(second.duplicates,2);
 assert.equal(mergeTrades(first.trades,[t,t,t]).added,1);
});
test('normalised trade CSV export can be reimported without changes',()=>{
 const a=trades();const exported=Papa.unparse(a,{columns:CSV_COLUMNS});
 const again=parseImport(exported);assert.deepEqual(again.errors,[]);assert.deepEqual(again.rows,a);
 assert.equal(mergeTrades(a,again.rows).added,0);
});
test('Fidelity common activity columns, preamble, signed amounts, fees and quoted names',()=>{
 const s='Account history\nRun Date,Action,Symbol,Description,Quantity,Price ($),Commission ($),Fees ($),Amount ($),Account\n01/15/2025,YOU BOUGHT,VTI,"Vanguard, total stock",10,100,1,0.5,-1001.50,Taxable';
 const p=parseImport(s);assert.deepEqual(p.errors,[]);assert.equal(p.source,'Fidelity');assert.equal(p.rows[0].fees,1.5);assert.equal(p.rows[0].amount,1001.5);
});
test('E*TRADE compact and spaced activity columns',()=>{
 const p=parseImport('TransactionDate,TransactionType,Symbol,Description,Quantity,Price,Commission,Amount\n01/15/25,Bought,AAPL,Apple,5,200,0,-1000');
 assert.deepEqual(p.errors,[]);assert.equal(p.source,'E*TRADE');assert.equal(p.rows[0].action,'BUY');
});
test('Vanguard common trade history columns',()=>{
 const p=parseImport('Trade Date,Transaction Description,Symbol,Share Price,Shares,Net Amount\n01/15/2025,Buy,VTI,100,10,-1000',{source:'Vanguard'});
 assert.deepEqual(p.errors,[]);assert.equal(p.rows[0].quantity,10);
});
test('Sharesight common trade columns with selectable day-first dates',()=>{
 const p=parseImport('Trade Date,Trade Type,Code,Quantity,Price,Brokerage,Currency\n15/01/2025,Buy,VTI,10,100,2,USD',{source:'Sharesight',dateOrder:'DMY'});
 assert.deepEqual(p.errors,[]);assert.equal(p.rows[0].date,'2025-01-15');assert.equal(p.rows[0].fees,2);
});
test('reinvestment recognises income once with or without separate dividend',()=>{
 const base=trades()[0];const reinvest={...base,id:'r',date:'2025-03-01',action:'REINVEST',quantity:0.1,price:100,fees:0,amount:10};
 const div={...reinvest,id:'d',action:'DIVIDEND',quantity:0,price:0};
 assert.equal(calculateLedger([base,reinvest]).dividends,10);
 assert.equal(calculateLedger([base,reinvest,div]).dividends,10);
 assert.equal(calculateLedger([base,div,reinvest]).dividends,10);
});
test('income remains after a position is fully sold',()=>{
 const a=trades();a[1]={...a[1],quantity:10};const l=calculateLedger(a);assert.equal(l.holdings.length,0);assert.equal(l.dividends,10);
});
test('missing purchase history and mixed currencies are reported',()=>{
 assert.match(calculateLedger(trades().slice(1)).issues[0],/sale exceeds/);
 assert.match(calculateLedger([{...trades()[0],currency:'AUD'}]).issues[0],/differs/);
});
test('unsupported actions and bad data are rejected with row numbers',()=>{
 const p=parseImport('date,action,symbol,quantity,price\n2025-02-30,BUY,VTI,10,100\n2025-01-01,Stock split,VTI,10,100\n2025-01-01,BUY TO COVER,VTI,10,100\n2025-01-01,BUY,VTI,bad,100');
 assert.equal(p.rows.length,0);assert.equal(p.errors.length,4);assert.equal(p.errors[0].row,2);
});
test('date order and leap date validation',()=>{
 assert.equal(parseDate('03/04/2025','DMY'),'2025-04-03');assert.equal(parseDate('03/04/2025'),'2025-03-04');assert.equal(parseDate('29-Feb-2024'),'2024-02-29');assert.throws(()=>parseDate('02/29/2025'));
});
test('full backup round trip preserves trades, settings, holdings and prices',()=>{
 const data={currency:'USD',holdings:[],trades:trades(),prices:{VTI:130},demo:false};
 const b=readBackup(JSON.stringify({format:'portfolio-desk-backup',version:1,data}));
 assert.deepEqual(JSON.parse(JSON.stringify(b)),data);
 assert.throws(()=>readBackup('{"format":"other"}'));
 assert.throws(()=>readBackup(JSON.stringify({format:'portfolio-desk-backup',version:1,data:{...data,prices:{VTI:-5}}})));
});
test('holdings snapshot import is separate from trade history',()=>{
 const p=parseImport('symbol,name,sector,quantity,cost,price,dividends\nVTI,Vanguard,US equities,10,100,120,10');
 assert.equal(p.kind,'holdings');assert.deepEqual(p.errors,[]);assert.equal(p.rows[0].cost,100);
});
test('stable transaction IDs deduplicate within the first file and flag conflicting rows',()=>{
 const t=trades()[0];assert.equal(mergeTrades([],[t,t]).added,1);
 assert.equal(mergeTrades([],[t,{...t,price:150}]).conflicts.length,1);
});
test('Vanguard commission fees are included in cost basis',()=>{
 const p=parseImport('Trade Date,Transaction Type,Symbol,Shares,Share Price,Commission Fees,Net Amount\n01/15/2025,Buy,VTI,10,100,5,-1005',{source:'Vanguard'});
 assert.deepEqual(p.errors,[]);assert.equal(p.rows[0].fees,5);
});
