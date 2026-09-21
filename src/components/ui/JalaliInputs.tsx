"use client";
import { useMemo, useState } from "react";
import { JALALI_MONTHS, jalaliFromGregorianInput, jalaliMonthLength, gregorianInputFromJalali, todayGregorianInput, gregorianToJalali, jalaliToGregorian, type JalaliParts } from "@/lib/jalali";
const faNum=(n:number|string)=>new Intl.NumberFormat("fa-IR").format(Number(n));
function coerce(gregorian:string, fallback?:string):JalaliParts{
const j=gregorian&&jalaliFromGregorianInput(gregorian);if(j)return j;
const f=fallback&&jalaliFromGregorianInput(fallback);if(f)return f;
const t=jalaliFromGregorianInput(todayGregorianInput())!;return t;}
export function JalaliDateInput({value,onChange,className,ariaLabel}:{value:string;onChange:(gregorian:string)=>void;className?:string;ariaLabel?:string}){
const j=coerce(value);const[y,m,d]=[j.jy,j.jm,j.jd];
const years=useMemo(()=>{const cur=jalaliFromGregorianInput(todayGregorianInput())!.jy;const arr:number[]=[];for(let k=cur-5;k<=cur+5;k++)arr.push(k);return arr;},[]);
const days=useMemo(()=>{const n=jalaliMonthLength(y,m);return Array.from({length:n},(_,i)=>i+1);},[y,m]);
const cls=className??"input !w-auto min-w-0 shrink !px-2 !py-1.5 text-xs";
const set=(ny:number,nm:number,nd:number)=>{const len=jalaliMonthLength(ny,nm);onChange(gregorianInputFromJalali(ny,nm,Math.min(nd,len)));};
return(<span className="flex min-w-0 flex-wrap items-center gap-1" dir="rtl">
<select aria-label={(ariaLabel??"تاریخ")+" روز"} className={cls} value={d} onChange={(e)=>set(y,m,Number(e.target.value))}>{days.map((x)=>(<option key={x} value={x}>{faNum(x)}</option>))}</select>
<select aria-label={(ariaLabel??"تاریخ")+" ماه"} className={cls} value={m} onChange={(e)=>set(y,Number(e.target.value),d)}>{JALALI_MONTHS.map((n,i)=>(<option key={n} value={i+1}>{n}</option>))}</select>
<select aria-label={(ariaLabel??"تاریخ")+" سال"} className={cls} value={y} onChange={(e)=>set(Number(e.target.value),m,d)}>{years.map((x)=>(<option key={x} value={x}>{faNum(x)}</option>))}</select>
</span>);}
export function JalaliDateTimeInput({value,onChange,className}:{value:string;onChange:(local:string)=>void;className?:string}){
const[datePart,timePart]=useMemo(()=>{if(!value)return[todayGregorianInput(),"12:00"];const[da,ti]=value.split("T");return[da||todayGregorianInput(),(ti||"12:00").slice(0,5)];},[value]);
const dateCls=className??"input !w-auto min-w-0 shrink !px-2 !py-1.5 text-xs";
return(<span className="flex min-w-0 w-full flex-wrap items-center gap-1" dir="rtl">
<input type="time" className="input !w-[4.5rem] shrink-0 !px-2 !py-1.5 text-xs tabular-nums" value={timePart} onChange={(e)=>onChange(datePart+"T"+e.target.value)} aria-label="ساعت"/>
<JalaliDateInput value={datePart} onChange={(g)=>onChange(g+"T"+timePart)} ariaLabel="تاریخ" className={dateCls}/>
</span>);}
export function JalaliMonthInput({value,onChange,className}:{value:string;onChange:(gregorianYYYYMM:string)=>void;className?:string}){
const cls=className??"input !w-auto min-w-0 shrink !py-1 text-xs";
// value is Gregorian YYYY-MM (API format); display equivalent Jalali year/month.
const cur=jalaliFromGregorianInput(todayGregorianInput())!.jy;
const years:number[]=[];for(let k=cur-5;k<=cur+2;k++)years.push(k);
let yy=cur,mm=1;
try{
const gm=Number(value.slice(5,7));const gy=Number(value.slice(0,4));
if(Number.isFinite(gy)&&Number.isFinite(gm)){const j=gregorianToJalali(gy,gm,1);yy=j.jy;mm=j.jm;}
}catch{}
const emit=(ny:number,nm:number)=>{const g=jalaliToGregorian(ny,nm,1);onChange(String(g.gy).padStart(4,"0")+"-"+String(g.gm).padStart(2,"0"));};
return(<span className="flex min-w-0 flex-wrap items-center gap-1" dir="rtl">
<select className={cls} value={mm} onChange={(e)=>emit(yy,Number(e.target.value))} aria-label="ماه">{JALALI_MONTHS.map((n,i)=>(<option key={n} value={i+1}>{n}</option>))}</select>
<select className={cls} value={yy} onChange={(e)=>emit(Number(e.target.value),mm)} aria-label="سال">{years.map((x)=>(<option key={x} value={x}>{faNum(x)}</option>))}</select>
</span>);}
export function useJalaliTodayGregorian(){const[t]=useState(()=>todayGregorianInput());return t;}
