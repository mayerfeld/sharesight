import React,{useMemo,useState,useRef} from 'react';
import {X,Upload,CheckCircle2,AlertTriangle} from 'lucide-react';
import {parseImport,mergeTrades,calculateLedger,CSV_COLUMNS} from './imports';
import Papa from 'papaparse';
import {readImportFile} from './spreadsheets';
export default function ImportDialog({data,onClose,onImport,download}){
 const [source,setSource]=useState('Auto-detect'),[account,setAccount]=useState('Default'),[dateOrder,setDateOrder]=useState('MDY'),[sheets,setSheets]=useState([]),[sheetIndex,setSheetIndex]=useState(0),[loading,setLoading]=useState(false),[filename,setFilename]=useState(''),[skip,setSkip]=useState(false),[fileError,setFileError]=useState('');
 const readVersion=useRef(0);
 const selected=sheets[sheetIndex];
 const result=useMemo(()=>{if(!selected)return null;if(selected.error)return {error:selected.error};try{return parseImport(selected.input,{source,account,dateOrder,currency:data.currency})}catch(e){return {error:e.message}}},[selected,source,account,dateOrder,data.currency]);
 const merged=result?.kind==='trades'?mergeTrades(data.trades||[],result.rows):null;
 const ledger=merged?calculateLedger(merged.trades,data.prices||{},data.currency):null;
 const blocked=loading||!!fileError||!result||result.error||!result.rows?.length||(result.errors.length&&!skip)||merged?.conflicts.length||ledger?.issues.length;
 async function choose(file){
  if(!file)return;
  const version=++readVersion.current;
  setFileError('');setSheets([]);setSheetIndex(0);setFilename(file.name);setSkip(false);setLoading(true);
  try {const next=await readImportFile(file);if(version===readVersion.current)setSheets(next);}
  catch(e){if(version===readVersion.current)setFileError(e.message);}
  finally{if(version===readVersion.current)setLoading(false);}
 }

 return <div className="modal-backdrop"><div className="modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-title"><h2 id="import-title">Import portfolio data</h2><button onClick={onClose} aria-label="Close import"><X/></button></div><p>Import transaction history from Fidelity, E*TRADE, Vanguard, or Sharesight. Choose a CSV or Excel export from your broker, then review it here.</p><div className="import-settings"><label>Export format<select value={source} onChange={e=>setSource(e.target.value)}>{['Auto-detect','Fidelity','E*TRADE','Vanguard','Sharesight','Portfolio Desk'].map(s=><option key={s}>{s}</option>)}</select></label><label>Account name<input value={account} onChange={e=>setAccount(e.target.value)} placeholder="e.g. Fidelity brokerage"/></label><label>Date order<select value={dateOrder} onChange={e=>setDateOrder(e.target.value)}><option value="MDY">Month / day / year (US)</option><option value="DMY">Day / month / year</option></select></label></div><div className="import-tip">Use the same account name on every update. Import overlapping date ranges safely; matching transactions are counted as duplicates. All imported amounts must be in {data.currency}.</div><label className="drop-zone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();choose(e.dataTransfer.files[0])}}><Upload size={26}/><b>{loading?'Reading your file…':filename||'Choose a CSV or Excel file, or drop it here'}</b><span>CSV, XLS or XLSX · up to 10 MB</span><input type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{choose(e.target.files[0]);e.target.value='';}}/></label>
{sheets.length>1&&<label className="sheet-selector">Worksheet<select value={sheetIndex} onChange={e=>{setSheetIndex(Number(e.target.value));setSkip(false);}}>{sheets.map((sheet,i)=><option value={i} key={i}>{sheet.name}</option>)}</select><small>Import one worksheet at a time. Only the selected sheet is included.</small></label>}
{fileError&&<div className="import-errors">{fileError}</div>}
{result?.error&&<div className="import-errors" role="alert">{result.error}</div>}
{result&&!result.error&&<><div className="import-summary"><CheckCircle2 size={19}/><b>{result.rows.length} valid {result.kind==='trades'?'transactions':'holdings'}</b><span>{result.source}</span></div>{merged&&<div className="merge-stats"><span><b>{merged.added}</b> new transactions</span><span><b>{merged.duplicates}</b> already imported</span><span><b>{merged.conflicts.length}</b> conflicts</span></div>}
<div className="import-preview"><table><thead><tr>{(result.kind==='trades'?['Date','Action','Symbol','Units','Price / amount']:['Symbol','Name','Units','Cost','Price']).map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{result.rows.slice(0,8).map((r,i)=><tr key={i}>{(result.kind==='trades'?[r.date,r.action,r.symbol,r.quantity,r.action==='DIVIDEND'?r.amount:r.price]:[r.symbol,r.name,r.quantity,r.cost,r.price]).map((v,j)=><td key={j}>{v}</td>)}</tr>)}</tbody></table>{result.rows.length>8&&<small>Showing the first 8 rows. All {result.rows.length} valid rows will be processed.</small>}</div>
{result.errors.length>0&&<div className="import-errors"><b><AlertTriangle size={14}/> {result.errors.length} rows need review</b><ul>{result.errors.slice(0,30).map(e=><li key={e.row}>Row {e.row}: {e.message}</li>)}</ul>{result.errors.length>30&&<p>More errors are included in the downloadable report.</p>}<button onClick={()=>download(Papa.unparse(result.errors,{escapeFormulae:true}),'import-errors.csv','text/csv')}>Download rejected rows report</button><label className="checkbox"><input type="checkbox" checked={skip} onChange={e=>setSkip(e.target.checked)}/> I reviewed these rows. Import valid rows only.</label></div>}
{merged?.conflicts.map((c,i)=><div className="import-errors" key={i}>{c.message}</div>)}
{ledger?.issues.length>0&&<div className="import-errors"><b>Resolve these issues before import</b><ul>{ledger.issues.slice(0,20).map((s,i)=><li key={i}>{s}</li>)}</ul></div>}
{result.kind==='holdings'&&<div className="import-tip">This snapshot replaces your existing holdings and transaction history. Export a backup first. Holdings snapshots cannot be merged as trades.</div>}
{result.kind==='trades'&&!(data.trades||[]).length&&data.holdings.length>0&&<div className="import-tip">This switches to transaction tracking and replaces your current holdings snapshot. Holdings will be calculated from the imported history. Export a backup first.</div>}
</>}
<div className="import-bottom"><button onClick={()=>download(Papa.unparse([Object.fromEntries(CSV_COLUMNS.map(k=>[k,({id:'example-1',date:'2025-01-15',action:'BUY',symbol:'VTI',name:'Vanguard Total Stock Market ETF',quantity:10,price:250,fees:0,amount:2500,currency:data.currency,account:account||'Default',source:'Portfolio Desk'})[k]]))]),'trade-template.csv','text/csv')}>Download trade template</button><button className="primary" disabled={!!blocked} onClick={()=>onImport(result,merged)}>Confirm import{merged?` · ${merged.added} new`:''}</button></div><p className="fine-print">Column mappings cover common export layouts. Options, shorts, transfers, splits and tax reporting are not supported. Never upload account passwords or credentials.</p></div></div>;
}
