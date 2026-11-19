import type {IdCard} from './id-card';
import styles from './pass-design.module.css';

export function PassDesign({card,wallet}:{card:IdCard;wallet:boolean}) {
 const fields=[['Department',card.agency],['Position',card.position],['Gender',card.gender],['Employee Number',card.employeeNumber]];
 return <section className={wallet?styles.wallet:styles.pass} aria-label={wallet?'Digital ID preview':'Physical pass preview'}>
  {wallet&&<div className={styles.walletBrand}>SevisWallet</div>}
  <header className={styles.header}>
   <img src="/png-state-emblem.png" alt=""/>
   <div>GOVERNMENT OF PAPUA NEW GUINEA</div>
   <h3>{wallet?'Public Servant Digital ID':'Public Servant ID Pass'}</h3>
   <span>{card.status==='issued'?'Issued':'Specimen'}</span>
  </header>
  <div className={styles.identity}>
   <img className={styles.photo} src={card.photoUrl} alt={'Verified portrait of '+card.name}/>
   <div className={styles.details}><h4>{card.name}</h4><dl>{fields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
   <img className={styles.qr} src={card.qrDataUrl} alt="Scan to check ID status"/>
  </div>
 </section>;
}
