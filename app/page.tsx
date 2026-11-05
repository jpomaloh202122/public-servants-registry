import RegistryApp from './registry-app';
import {getChatGPTUser,chatGPTSignOutPath} from './chatgpt-auth';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page(){
 const user=await getChatGPTUser();
 if(!user)redirect('/login');
 return <RegistryApp displayName={user.displayName} email={user.email} signOutPath={chatGPTSignOutPath('/login')}/>;
}
