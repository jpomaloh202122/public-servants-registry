export interface Servant { id: string; payrollNumber: string; name: string; agencyCode: string; dob: string; photoVerified: boolean; identityVerified: boolean; approved: boolean; }
export function assess(records: Servant[], agencyCodes: string[], asOf: string) {
 const today = new Date(asOf + 'T00:00:00Z');
 if (!Number.isFinite(today.getTime())) throw new Error('Invalid assessment date');
 const counts = new Map<string, number>();
 for (const r of records) counts.set(r.payrollNumber, (counts.get(r.payrollNumber) ?? 0) + 1);
 return records.map(r => {
  const issues: string[] = [];
  if (!r.payrollNumber.trim()) issues.push('Missing payroll number');
  if (!r.name.trim()) issues.push('Missing name');
  if (!agencyCodes.includes(r.agencyCode)) issues.push('Unknown agency code');
  const date = new Date(r.dob + 'T00:00:00Z');
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(r.dob) && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === r.dob && date <= today;
  let age: number | null = null;
  if (!valid) issues.push('Invalid date of birth');
  else { age = today.getUTCFullYear()-date.getUTCFullYear(); if (today.getUTCMonth()<date.getUTCMonth() || (today.getUTCMonth()===date.getUTCMonth() && today.getUTCDate()<date.getUTCDate())) age--; if(age<18 || age>65) issues.push('Age outside review range (18–65)'); }
  if (r.payrollNumber && counts.get(r.payrollNumber)! > 1) issues.push('Duplicate payroll number');
  if (!r.photoVerified) issues.push('Photo verification pending');
  if (!r.identityVerified) issues.push('Identity verification pending');
  return { ...r, age, issues, ready: issues.length===0 && r.approved };
 });
}
