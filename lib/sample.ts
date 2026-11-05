import type { Servant } from './quality';
export const agencies = [{code:'001',name:'Sample agency A'},{code:'002',name:'Sample agency B'}];
export const sample: Servant[] = [
{id:'1',payrollNumber:'DEMO001',name:'Sample Officer One',agencyCode:'001',dob:'1985-06-12',photoVerified:true,identityVerified:true,approved:true},
{id:'2',payrollNumber:'DEMO002',name:'Sample Officer Two',agencyCode:'002',dob:'2009-02-01',photoVerified:false,identityVerified:false,approved:false},
{id:'3',payrollNumber:'DEMO003',name:'Sample Officer Three',agencyCode:'999',dob:'1980-02-30',photoVerified:false,identityVerified:false,approved:false},
{id:'4',payrollNumber:'DEMO002',name:'Sample Officer Four',agencyCode:'001',dob:'1978-07-21',photoVerified:true,identityVerified:false,approved:false}];
