export const sampleHoldings = [
  {symbol:'VTI',name:'Vanguard Total Stock Market ETF',sector:'US equities',quantity:80,cost:220.40,price:281.65,dividends:342.70},
  {symbol:'VXUS',name:'Vanguard Total International Stock',sector:'International equities',quantity:140,cost:55.20,price:63.45,dividends:218.40},
  {symbol:'AAPL',name:'Apple Inc.',sector:'US equities',quantity:45,cost:174.30,price:226.20,dividends:42.90},
  {symbol:'MSFT',name:'Microsoft Corporation',sector:'US equities',quantity:30,cost:342.80,price:419.60,dividends:88.50},
  {symbol:'BND',name:'Vanguard Total Bond Market ETF',sector:'Fixed income',quantity:120,cost:72.20,price:73.85,dividends:295.60}
];
export function validateHolding(h) {
  if (!String(h.symbol || '').trim() || !String(h.name || '').trim()) throw new Error('Symbol and name are required.');
  for (const field of ['quantity','cost','price','dividends']) {
    if (h[field] === '' || h[field] == null || !Number.isFinite(Number(h[field])) || Number(h[field]) < 0) throw new Error(`${field} must be a non-negative number.`);
  }
  if (Number(h.quantity) <= 0) throw new Error('Quantity must be greater than zero.');
  return {symbol:String(h.symbol).trim().toUpperCase(),name:String(h.name).trim(),sector:String(h.sector || 'Other').trim(),...Object.fromEntries(['quantity','cost','price','dividends'].map(k=>[k,Number(h[k])]))};
}
export function summarize(holdings) {
  const cost = holdings.reduce((s,h)=>s+h.quantity*h.cost,0);
  const value = holdings.reduce((s,h)=>s+h.quantity*h.price,0);
  const dividends = holdings.reduce((s,h)=>s+h.dividends,0);
  const gain = value-cost;
  return {cost,value,dividends,gain,total:gain+dividends,returnPct:cost ? (gain+dividends)/cost*100 : 0};
}
