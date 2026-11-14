import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../dist/',import.meta.url)));
const port=Number(process.env.PORT||8793);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml','.md':'text/markdown; charset=utf-8'};
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);let file=path.resolve(root,'.'+pathname);if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()};if((await stat(file)).isDirectory())file=path.join(file,'index.html');const content=await readFile(file);res.setHeader('Content-Type',types[path.extname(file)]||'application/json');const headers=await readFile(path.join(root,'_headers'),'utf8');for(const line of headers.split('\n')){const m=/^  ([\w-]+): (.*)$/.exec(line);if(m&&m[1]!=='Cache-Control')res.setHeader(m[1],m[2])}res.writeHead(200);res.end(req.method==='HEAD'?undefined:content)}catch{res.writeHead(404);res.end('Not found')}}).listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}`));
