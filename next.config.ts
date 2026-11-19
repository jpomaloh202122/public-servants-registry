import type {NextConfig} from "next";
const config:NextConfig={output:"standalone",serverExternalPackages:["better-sqlite3"],async headers(){return [{source:"/verify/:path*",headers:[{key:"Referrer-Policy",value:"no-referrer"},{key:"X-Robots-Tag",value:"noindex, nofollow"}]}];}};
export default config;
