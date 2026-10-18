import test from 'node:test';
import assert from 'node:assert/strict';
import {File} from 'node:buffer';
import * as XLSX from 'xlsx';
import {readImportFile} from '../src/spreadsheets.js';
import {parseImport,mergeTrades,calculateLedger} from '../src/imports.js';
const headers=['date','action','symbol','name','quantity','price','fees','amount','currency','account','id'];
const rows=[headers,['2025-01-15','BUY','VTI','Vanguard',10,100,2,1002,'USD','Taxable','a'],['2025-02-15','SELL','VTI','Vanguard',4,120,1,479,'USD','Taxable','b']];
function file(sheets,type='xlsx',options={}){
 const workbook=XLSX.utils.book_new();
 for(const [name,sheet] of sheets)XLSX.utils.book_append_sheet(workbook,Array.isArray(sheet)?XLSX.utils.aoa_to_sheet(sheet):sheet,name);
 Object.assign(workbook,options);
 return new File([XLSX.write(workbook,{type:'buffer',bookType:type})],`trades.${type}`);
}
for(const type of ['xls','xlsx']){
 test(`${type} binary workbook imports the same trades as CSV and detects reimports`,async()=>{
  const [sheet]=await readImportFile(file([['Trades',rows]],type));
  const result=parseImport(sheet.input);
  const csv=parseImport(XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows)));
  assert.deepEqual(result,csv);assert.deepEqual(result.errors,[]);
  assert.equal(mergeTrades(result.rows,result.rows).added,0);
  assert.equal(calculateLedger(result.rows).holdings[0].quantity,6);
 });
 test(`${type} native spreadsheet dates are independent of selected date order`,async()=>{
  const sheet=XLSX.utils.aoa_to_sheet(rows);
  sheet.A2={t:'n',v:45672,z:'mm/dd/yyyy'}; // 2025-01-15 in the 1900 date system
  const [parsed]=await readImportFile(file([['Trades',sheet]],type));
  const result=parseImport(parsed.input,{dateOrder:'DMY'});
  assert.equal(result.rows[0].date,'2025-01-15');assert.deepEqual(result.errors,[]);
 });
}
test('1904 Excel date system is converted correctly',async()=>{
 const sheet=XLSX.utils.aoa_to_sheet(rows);sheet.A2={t:'n',v:44210,z:'mm/dd/yyyy'};
 const [parsed]=await readImportFile(file([['Trades',sheet]],'xlsx',{Workbook:{WBProps:{date1904:true}}}));
 assert.equal(parseImport(parsed.input).rows[0].date,'2025-01-15');
});
test('worksheet selection preserves separate tables and physical row numbers',async()=>{
 const workbook=file([['Read me',[['Instructions'],['Use the Trades tab']]],['Trades',[[],['Broker history'],...rows]],['Holdings',[['symbol','name','quantity','cost','price','dividends'],['VTI','Vanguard',10,100,120,10]]]]);
 const sheets=await readImportFile(workbook);
 assert.deepEqual(sheets.map(s=>s.name),['Read me','Trades','Holdings']);
 assert.throws(()=>parseImport(sheets[0].input),/header/);
 assert.equal(parseImport(sheets[1].input).rows.length,2);
 assert.equal(parseImport(sheets[2].input).kind,'holdings');
 const bad=[...sheets[1].input];bad.push(['bad date','BUY','VTI','Vanguard',10,100,0,1000]);
 assert.equal(parseImport(bad).errors[0].row,6);
});
test('invalid, renamed, unsupported, oversized and empty files fail with actionable errors',async()=>{
 await assert.rejects(()=>readImportFile(new File(['not excel'],'bad.xls')),/not an Excel/);
 await assert.rejects(()=>readImportFile(new File(['fake'],'bad.pdf')),/\.csv, \.xls, or \.xlsx/);
 await assert.rejects(()=>readImportFile({size:11*1024*1024,name:'large.xls'}),/10 MB/);
 await assert.rejects(()=>readImportFile(file([['Empty',[]]])),/no worksheets/);
});
test('oversized worksheet is isolated so a valid second sheet can be used',async()=>{
 const large=XLSX.utils.aoa_to_sheet([['Heading']]);large.A50001={t:'s',v:'end'};large['!ref']='A1:A50001';
 const sheets=await readImportFile(file([['Too big',large],['Trades',rows]]));
 assert.match(sheets[0].error,/too large/);assert.equal(parseImport(sheets[1].input).rows.length,2);
});
test('CSV still uses the original parser and spreadsheet-invalid rows remain visible',async()=>{
 const csv=XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows));
 const [sheet]=await readImportFile(new File([csv],'trades.csv'));
 assert.deepEqual(parseImport(sheet.input),parseImport(csv));
 const bad=[headers,['2025-01-15','Split','VTI','Vanguard',10,100,0,1000]];
 const [xls]=await readImportFile(file([['Trades',bad]],'xls'));
 assert.equal(parseImport(xls.input).errors.length,1);
});
test('HTML tables exported with an XLS extension are imported as data',async()=>{
 const html='<html><body><table><tr><th>date</th><th>action</th><th>symbol</th><th>quantity</th><th>price</th></tr><tr><td>2025-01-15</td><td>BUY</td><td>VTI</td><td>10</td><td>100</td></tr></table></body></html>';
 const [sheet]=await readImportFile(new File([html],'broker.xls'));
 const result=parseImport(sheet.input);assert.deepEqual(result.errors,[]);assert.equal(result.rows[0].quantity,10);
});
test('spreadsheet errors cannot become zero-valued fees silently',async()=>{
 const sheet=XLSX.utils.aoa_to_sheet(rows);sheet.G2={t:'e',v:7};
 const [parsed]=await readImportFile(file([['Trades',sheet]]));
 assert.match(parsed.error,/Cell G2/);
});
