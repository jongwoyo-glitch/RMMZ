@echo off
echo ========================================
echo   RMMZ Dev Server - http://localhost:8190
echo   Ctrl+C to stop
echo ========================================
cd /d "%~dp0"
start http://localhost:8190
node -e "const h=require('http'),f=require('fs'),p=require('path'),m={'.html':'text/html','.js':'application/javascript','.json':'application/json','.png':'image/png','.ogg':'audio/ogg','.css':'text/css','.txt':'text/plain'};h.createServer((q,r)=>{let u=q.url==='/'?'/index.html':decodeURIComponent(q.url);let fp=p.join(__dirname,u);f.readFile(fp,(e,d)=>{if(e){r.writeHead(404);r.end('Not found');return;}r.writeHead(200,{'Content-Type':m[p.extname(fp)]||'application/octet-stream','Access-Control-Allow-Origin':'*'});r.end(d);});}).listen(8190,()=>console.log('Serving on http://localhost:8190'));"
pause
