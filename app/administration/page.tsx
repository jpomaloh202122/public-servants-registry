import {notFound} from 'next/navigation';
import {getRegistrySession} from '../chatgpt-auth';
import Administration from './workspace';
export default async function Page(){
 if((await getRegistrySession())?.access!=='admin')notFound();
 return <Administration/>;
}
