export function adminJson(body:unknown,init?:ResponseInit) {
 const headers=new Headers(init?.headers);
 headers.set("Cache-Control","no-store, max-age=0");
 headers.set("Vary","Cookie");
 return Response.json(body,{...init,headers});
}
