export function percentChange(start:number,end:number):number|null {return Number.isFinite(start)&&Number.isFinite(end)&&start!==0?(end-start)/Math.abs(start)*100:null}
export function absoluteChange(start:number,end:number):number|null {return Number.isFinite(start)&&Number.isFinite(end)?end-start:null}
export function formatNumber(value:number|null|undefined,digits=1):string {return value===null||value===undefined||!Number.isFinite(value)?'Unavailable':value.toLocaleString(undefined,{minimumFractionDigits:digits,maximumFractionDigits:digits})}
export function signed(value:number|null|undefined,digits=1):string {return value===null||value===undefined||!Number.isFinite(value)?'Unavailable':`${value>0?'+':''}${formatNumber(value,digits)}`}
