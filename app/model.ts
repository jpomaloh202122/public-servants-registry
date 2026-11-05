import {dobIssue} from './quality';
export type Agency={id:string;code:string;name:string;type:string};
export type Employee={id:string;number:string;first:string;last:string;gender:string;dob:string;position:string;agency:string;status:string;photo:string;verified:boolean;updated:string;sourceRow?:number;sourceUnit?:string;sourceConflict?:boolean;statusReviewed?:boolean;sourceStatus?:string};
export type Event={id:string;time:string;action:string;detail:string;actor:string};
export type Data={agencies:Agency[];employees:Employee[];events:Event[];sample:boolean};
export const statuses=['Active','On leave','Suspended','Terminated','Retired','Not provided'];
export function issues(e:Employee){return [!e.first.trim()&&'First name',!e.last.trim()&&'Last name',!e.number.trim()&&'Employee number',(!e.gender.trim()||['N','U'].includes(e.gender.trim().toUpperCase()))&&'Sex / gender',!e.dob&&'Date of birth',!e.position.trim()&&'Position',!e.agency.trim()&&'Department',e.status==='Not provided'&&'Employment status',dobIssue(e),e.sourceConflict&&'Conflicting source rows',!e.photo&&'Photograph',e.photo&&!e.verified&&'Photo verification'].filter(Boolean) as string[];}
export function ready(e:Employee){return e.status==='Active'&&issues(e).length===0;}
export function seed():Data{return {agencies:[],employees:[],events:[],sample:false};}
