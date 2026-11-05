'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import type {ReactNode} from 'react';
export const palettes={office:{name:'Office colours',green:'#227a68',blue:'#276eac',amber:'#bd8115',red:'#b94640',purple:'#8250a1',gray:'#747d87',series:['#276eac','#227a68','#8250a1','#bd8115','#b94640','#167f8e','#8c633e','#5d749b']},contrast:{name:'High contrast',green:'#007a73',blue:'#155aa8',amber:'#b76500',red:'#a92f4b',purple:'#662f91',gray:'#545b66',series:['#155aa8','#b76500','#007a73','#a92f4b','#662f91','#147b9a','#6c6421','#344564']}};
export type ChartPalette=typeof palettes.office;
const Context=createContext({scheme:'office',palette:palettes.office,setScheme:(_s:string)=>{}});
export function ChartThemeProvider({children}:{children:ReactNode}){const [scheme,setValue]=useState('office');useEffect(()=>{try{const v=localStorage.getItem('gpo-chart-colours');if(v==='office'||v==='contrast')setValue(v);}catch{}},[]);function setScheme(v:string){if(v!=='office'&&v!=='contrast')return;setValue(v);try{localStorage.setItem('gpo-chart-colours',v);}catch{}}return <Context.Provider value={{scheme,palette:palettes[scheme as keyof typeof palettes],setScheme}}>{children}</Context.Provider>;}
export const useChartTheme=()=>useContext(Context);
export function ChartPaletteControl(){const {scheme,setScheme}=useChartTheme();return <label className="chart-palette-control">Graph colours<select aria-label="Graph colour scheme" value={scheme} onChange={e=>setScheme(e.target.value)}><option value="office">Office colours</option><option value="contrast">High contrast</option></select></label>;}
export function agencyColour(id:string,palette:ChartPalette){let hash=0;for(const c of id)hash=(hash*31+c.charCodeAt(0))>>>0;return palette.series[hash%palette.series.length];}
