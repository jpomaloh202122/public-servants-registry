'use client';
import {useEffect,useState} from 'react';
import type {IdCard} from './id-card';
import {renderPass} from './pass-renderer';
import styles from './pass-design.module.css';

export function PassDesign({card,wallet}:{card:IdCard;wallet:boolean}) {
 const [result,setResult]=useState<{card:IdCard;wallet:boolean;image?:string;error?:string}>();
 useEffect(()=>{
  let active=true;
  renderPass(card,wallet?'digital':'physical')
   .then(canvas=>{if(active)setResult({card,wallet,image:canvas.toDataURL('image/png')});})
   .catch(error=>{if(active)setResult({card,wallet,error:error instanceof Error?error.message:'Unable to load card artwork.'});});
  return()=>{active=false;};
 },[card,wallet]);
 if(result?.card!==card||result.wallet!==wallet)return <p role="status">Preparing ID…</p>;
 if(result.error)return <p role="alert">{result.error}</p>;
 const title=wallet?'SevisWallet Public Servant Digital ID':'Public Servant ID Pass';
 return <img className={wallet?styles.digital:styles.physical} src={result.image}
  alt={title+'. '+card.status+'. '+card.name+'. Department: '+card.agency+'. Position: '+card.position+'. Gender: '+card.gender+'. Employee Number: '+card.employeeNumber}/>;
}
