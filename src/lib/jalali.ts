/* Central Jalali (Shamsi) helpers - single source of truth for ALL dates.
 * Backend/API keep exchanging Gregorian ISO. Only presentation + inputs are Jalali.
 * No external dependency. */
export const TIME_ZONE = "Asia/Tehran";
export const JALALI_MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
function div(a:number,b:number){return Math.trunc(a/b)} function mod(a:number,b:number){return a-Math.trunc(a/b)*b}
const BR=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
function jalCal(jy:number){const bl=BR.length;const gy=jy+621;let leapJ=-14,jp=BR[0],jm=0,jump=0;
for(let i=1;i<bl;i++){jm=BR[i];jump=jm-jp;if(jy<jm)break;leapJ+=div(jump,33)*8+div(mod(jump,33),4);jp=jm}
let n=jy-jp;leapJ+=div(n,33)*8+div(mod(n,33)+3,4);if(mod(jump,33)===4&&jump-n===4)leapJ+=1;
const leapG=div(gy,4)-div((div(gy,100)+1)*3,4)-150;const march=20+leapJ-leapG;
if(jump-n<6)n=n-jump+div(jump+4,33)*33;let leap=mod(mod(n+1,33)-1,4);if(leap===-1)leap=4;return{leap,gy,march}}
export function isLeapJalali(jy:number){return jalCal(jy).leap===0}
export function jalaliMonthLength(jy:number,jm:number){if(jm<=6)return 31;if(jm<=11)return 30;return isLeapJalali(jy)?30:29}
function g2d(gy:number,gm:number,gd:number){const d=div((gy+div(gm-8,6)+100100)*1461,4)+div(153*mod(gm+9,12)+2,5)+gd-34840408;return d-div(div(gy+100100+div(gm-8,6),100)*3,4)+752}
function d2g(jdn:number){let j=4*jdn+139361631;j=j+div(div(4*jdn+183187720,146097)*3,4)*4-3908;const i=div(mod(j,1461),4)*5+308;const gd=div(mod(i,153),5)+1;const gm=mod(div(i,153),12)+1;const gy=div(j,1461)-100100+div(8-gm,6);return{gy,gm,gd}}
function j2d(jy:number,jm:number,jd:number){const r=jalCal(jy);return g2d(r.gy,3,r.march)+(jm-1)*31-div(jm,7)*(jm-7)+jd-1}
function d2j(jdn:number){const gy=d2g(jdn).gy;let jy=gy-621;const r=jalCal(jy);const jdn1f=g2d(gy,3,r.march);let jd=0,jm=0;let k=jdn-jdn1f;
if(k>=0){if(k<=185){jm=1+div(k,31);jd=mod(k,31)+1;return{jy,jm,jd}}k-=186}else{jy-=1;k+=179;if(r.leap===1)k+=1}
jm=7+div(k,30);jd=mod(k,30)+1;return{jy,jm,jd}}
export type JalaliParts={jy:number;jm:number;jd:number};
export function gregorianToJalali(gy:number,gm:number,gd:number):JalaliParts{return d2j(g2d(gy,gm,gd))}
export function jalaliToGregorian(jy:number,jm:number,jd:number){const r=d2g(j2d(jy,jm,jd));return{gy:r.gy,gm:r.gm,gd:r.gd}}
function pad2(n:number){return String(n).padStart(2,"0")}
export function padGregorian(gy:number,gm:number,gd:number){return gy+"-"+pad2(gm)+"-"+pad2(gd)}
export function gregorianInputFromJalali(jy:number,jm:number,jd:number){const g=jalaliToGregorian(jy,jm,jd);return padGregorian(g.gy,g.gm,g.gd)}
export function parseGregorianInput(v:string){const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v);if(!m)return null;return{gy:Number(m[1]),gm:Number(m[2]),gd:Number(m[3])}}
export function jalaliFromGregorianInput(v:string):JalaliParts|null{const g=parseGregorianInput(v);if(!g)return null;return gregorianToJalali(g.gy,g.gm,g.gd)}
export function jalaliPartsFromDate(d:Date):JalaliParts{
const p=new Intl.DateTimeFormat("en-CA",{timeZone:TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
const get=(t:string)=>p.find((x)=>x.type===t)?.value??"";
return gregorianToJalali(Number(get("year")),Number(get("month")),Number(get("day")));}
export function todayGregorianInput(now=new Date()):string{
const p=new Intl.DateTimeFormat("en-CA",{timeZone:TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
const get=(t:string)=>p.find((x)=>x.type===t)?.value??"";return get("year")+"-"+get("month")+"-"+get("day");}
export type DateInput=string|Date|number|null|undefined;
function toDate(v:DateInput):Date|null{if(v==null||v==="")return null;const d=v instanceof Date?v:new Date(v);return Number.isNaN(d.getTime())?null:d;}
export function formatJalaliDate(v:DateInput):string{const d=toDate(v);if(!d)return "—";
return new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit"}).format(d);}
export function formatJalaliDateTime(v:DateInput):string{const d=toDate(v);if(!d)return "—";
return new Intl.DateTimeFormat("fa-IR-u-ca-persian",{timeZone:TIME_ZONE,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);}
export function formatJalaliTime(v:DateInput):string{const d=toDate(v);if(!d)return "—";
return new Intl.DateTimeFormat("fa-IR",{timeZone:TIME_ZONE,hour:"2-digit",minute:"2-digit"}).format(d);}
export function formatJalaliLong(v:DateInput):string{const d=toDate(v);if(!d)return "—";
const j=jalaliPartsFromDate(d);const fa=(n:number)=>new Intl.NumberFormat("fa-IR").format(n);
return fa(j.jd)+" "+JALALI_MONTHS[j.jm-1]+" "+fa(j.jy);}
export function formatJalaliMonthDay(v:DateInput):string{const d=toDate(v);if(!d)return "—";
const j=jalaliPartsFromDate(d);const fa=(n:number)=>new Intl.NumberFormat("fa-IR").format(n);
return fa(j.jd)+" "+JALALI_MONTHS[j.jm-1];}
export function formatJalaliWeekday(v:DateInput):string{const d=toDate(v);if(!d)return "—";
return new Intl.DateTimeFormat("fa-IR",{timeZone:TIME_ZONE,weekday:"long"}).format(d);}
