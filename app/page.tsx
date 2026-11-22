import HRWorkspace from './hr-workspace';
import RegistryApp from './registry-app';
import {getRegistrySession,chatGPTSignOutPath} from './chatgpt-auth';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page(){
 const user=await getRegistrySession();
 if(!user)redirect('/login');
 if(user.access==='hr'&&user.role)return <HRWorkspace role={user.role.name} edit={user.role.mode==='correct'}/>;
 return <RegistryApp isAdmin={user.access==='admin'} canComparePhotos={user.canComparePhotos} canManageSources={user.canManageSources} displayName={user.displayName} email={user.email} signOutPath={chatGPTSignOutPath('/login')}/>;
}
