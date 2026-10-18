import React,{useState} from 'react';
export default function ValueChart({points,money}){
 const [hover,setHover]=useState(null);
 const valid=points.filter(p=>p.value!==null);
 if(valid.length<2)return <article className="panel value-history"><h2>Investment value</h2><p className="chart-empty">Historical prices are needed to draw this period. Refresh market data; the app won’t invent a historical graph from purchase prices.</p></article>;
 const W=1000,H=300,left=65,right=18,top=15,bottom=37;
 const start=Date.parse(points[0].date),end=Date.parse(points.at(-1).date),max=Math.max(...valid.map(p=>p.value),1)*1.08;
 const x=p=>left+(Date.parse(p.date)-start)/Math.max(end-start,86400000)*(W-left-right),y=p=>H-bottom-p.value/max*(H-top-bottom);
 const segments=[];let current=[];
 for(const p of points){if(p.value===null){if(current.length)segments.push(current);current=[];}else current.push(p);}if(current.length)segments.push(current);
 const inspected=hover!==null?points[hover]:points.at(-1);
 const labels=points.filter((_,i)=>i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/5))===0);
 return <article className="panel value-history"><div className="panel-heading"><div><h2>Investment value</h2><p>Market value of tracked securities · Includes purchases, sales and reinvested shares</p></div><div className="chart-readout"><b>{inspected.value===null?'Price unavailable':money(inspected.value)}</b><small>{inspected.date}</small></div></div><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Historical portfolio market value. Purchases and sales affect the value; this is not a return percentage." onPointerLeave={()=>setHover(null)} onPointerMove={e=>{const rect=e.currentTarget.getBoundingClientRect(),day=start+((e.clientX-rect.left)/rect.width*W-left)/(W-left-right)*(end-start);let best=0;points.forEach((p,i)=>{if(Math.abs(Date.parse(p.date)-day)<Math.abs(Date.parse(points[best].date)-day))best=i;});setHover(best);}}>
{[0,.25,.5,.75,1].map(f=><g key={f}><line x1={left} y1={H-bottom-f*(H-top-bottom)} x2={W-right} y2={H-bottom-f*(H-top-bottom)} stroke="#e9edf4"/><text x={left-10} y={H-bottom-f*(H-top-bottom)+4} textAnchor="end">{new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(f*max)}</text></g>)}
{segments.map((segment,i)=>{const line=segment.map((p,j)=>`${j?'L':'M'}${x(p)},${y(p)}`).join(' ');return <g key={i}><path d={`${line} L${x(segment.at(-1))},${H-bottom} L${x(segment[0])},${H-bottom} Z`} fill="#3768e8" fillOpacity=".17"/><path d={line} fill="none" stroke="#3768e8" strokeWidth="2"/>{segment.length===1&&<circle cx={x(segment[0])} cy={y(segment[0])} r="3" fill="#3768e8"/>}</g>;})}
{labels.map((p,i)=><text key={i} x={x(p)} y={H-10} textAnchor={i===0?'start':i===labels.length-1?'end':'middle'}>{p.date}</text>)}
{hover!==null&&inspected.value!==null&&<g><line x1={x(inspected)} x2={x(inspected)} y1={top} y2={H-bottom} stroke="#9fb5eb" strokeDasharray="4 4"/><circle cx={x(inspected)} cy={y(inspected)} r="4" fill="#3768e8"/></g>}
</svg><label className="chart-slider">Inspect date<input type="range" min="0" max={points.length-1} value={hover??points.length-1} onChange={e=>setHover(Number(e.target.value))}/></label>{valid.length<points.length&&<p className="chart-coverage">Some historical dates have missing prices. Gaps are left visible.</p>}</article>;
}
