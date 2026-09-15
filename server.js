
const path=require("path"),http=require("http"),express=require("express");
const {Server}=require("socket.io");
const app=express(),server=http.createServer(app),io=new Server(server);
app.use(express.static(path.join(__dirname,"public")));

const MAX=6, rooms=new Map();
const MAPS={
 asylum:{name:"Blackwood Asylum",w:1400,h:950,
  spawns:[[110,110],[1290,110],[110,840],[1290,840],[700,100],[700,850]],
  fuses:[[290,260],[1070,250],[700,735]],medkits:[[410,520],[970,650]],
  exit:[1320,410],hides:[[220,620],[1160,600]],
  walls:[[0,0,1400,35],[0,915,1400,35],[0,0,35,950],[1365,0,35,950],
  [170,130,350,35],[880,130,350,35],[170,785,350,35],[880,785,350,35],
  [350,130,35,330],[1015,420,35,365],[510,315,380,35],[510,600,380,35]]
 }
};
const MONSTERS={
 wraith:{name:"The Wraith",speed:1.55,damage:5,range:680,color:"#151018"},
 butcher:{name:"The Butcher",speed:1.25,damage:9,range:540,color:"#1c1111"},
 shade:{name:"The Shade",speed:2.0,damage:4,range:590,color:"#0b1517"}
};
function mkRoom(){return{map:"asylum",players:{},fuses:new Set([0,1,2]),medkits:new Set([0,1]),hides:new Set([0,1]),power:0,started:false,ended:false,winner:false,monsterType:["wraith","butcher","shade"][Math.floor(Math.random()*3)],monster:{x:700,y:470,target:null,anger:0},time:0}}
function avatar(a){return{gender:a?.gender||"Female",skin:a?.skin||"#d7a27c",hair:a?.hair||"Long curls",hairColor:a?.hairColor||"#17151a",outfit:a?.outfit||"#7c3145",accessory:a?.accessory||"None"}}
function join(code,s,name,a){let r=rooms.get(code),i=Object.keys(r.players).length,q=MAPS[r.map].spawns[i%6];r.players[s.id]={id:s.id,name:(name||"Survivor").slice(0,16),x:q[0],y:q[1],hp:100,stamina:100,down:false,hidden:false,revive:0,items:[],avatar:avatar(a)};s.room=code;s.join(code)}
io.on("connection",s=>{
 s.on("create",({name,avatar:a},cb)=>{let c;do c=Math.random().toString(36).slice(2,6).toUpperCase();while(rooms.has(c));rooms.set(c,mkRoom());join(c,s,name,a);cb({ok:true,code:c,id:s.id})});
 s.on("join",({code,name,avatar:a},cb)=>{code=String(code||"").toUpperCase();let r=rooms.get(code);if(!r)return cb({ok:false,error:"Room not found"});if(Object.keys(r.players).length>=MAX)return cb({ok:false,error:"Room full"});join(code,s,name,a);cb({ok:true,code,id:s.id})});
 s.on("start",()=>{let r=rooms.get(s.room);if(r&&!r.ended)r.started=true});
 s.on("move",d=>{let r=rooms.get(s.room),p=r?.players[s.id];if(!r||!p||!r.started||r.ended||p.down||p.hidden)return;let dx=+d.dx||0,dy=+d.dy||0,l=Math.hypot(dx,dy)||1,spd=p.stamina>0?4.3:2.1;p.x=Math.max(48,Math.min(1352,p.x+dx/l*spd));p.y=Math.max(48,Math.min(902,p.y+dy/l*spd));if(dx||dy)p.stamina=Math.max(0,p.stamina-.75);else p.stamina=Math.min(100,p.stamina+1.1)});
 s.on("interact",()=>{let r=rooms.get(s.room),p=r?.players[s.id];if(!r||!p||p.down)return;let m=MAPS[r.map];
  r.fuses.forEach(i=>{let q=m.fuses[i];if(Math.hypot(p.x-q[0],p.y-q[1])<70){r.fuses.delete(i);r.power++}});
  r.medkits.forEach(i=>{let q=m.medkits[i];if(Math.hypot(p.x-q[0],p.y-q[1])<65&&p.hp<100){r.medkits.delete(i);p.hp=Math.min(100,p.hp+40)}});
  r.hides.forEach(i=>{let q=m.hides[i];if(Math.hypot(p.x-q[0],p.y-q[1])<70){p.hidden=!p.hidden}});
  if(r.power===3&&p.x>1260&&p.y>350&&p.y<540){r.ended=true;r.winner=true}
 });
 s.on("revive",id=>{let r=rooms.get(s.room),p=r?.players[s.id],q=r?.players[id];if(p&&q&&q.down&&Math.hypot(p.x-q.x,p.y-q.y)<75){q.revive=(q.revive||0)+1;if(q.revive>30){q.down=false;q.hp=55;q.revive=0}}});
 s.on("disconnect",()=>{let r=rooms.get(s.room);if(r){delete r.players[s.id];if(!Object.keys(r.players).length)rooms.delete(s.room)}})
});
setInterval(()=>{
 for(const [code,r] of rooms){
  if(r.started&&!r.ended){
   r.time++;
   const alive=Object.values(r.players).filter(p=>!p.down&&p.hp>0&&!p.hidden);
   if(!alive.length&&Object.keys(r.players).length)r.ended=true;
   const type=MONSTERS[r.monsterType];let target=null,best=1e9;
   for(const p of alive){let d=Math.hypot(p.x-r.monster.x,p.y-r.monster.y);if(d<best){best=d;target=p}}
   r.monster.target=target?.id||null;
   if(target&&best<type.range){r.monster.anger=Math.min(1,r.monster.anger+.006);let speed=type.speed+(r.monster.anger*.7),dx=target.x-r.monster.x,dy=target.y-r.monster.y,l=Math.hypot(dx,dy)||1;r.monster.x+=dx/l*speed;r.monster.y+=dy/l*speed;if(best<50){target.hp=Math.max(0,target.hp-type.damage);if(target.hp===0)target.down=true}}else r.monster.anger=Math.max(0,r.monster.anger-.003);
  }
  io.to(code).emit("state",{players:Object.values(r.players),fuses:[...r.fuses],medkits:[...r.medkits],hides:[...r.hides],power:r.power,started:r.started,ended:r.ended,winner:r.winner,monster:r.monster,map:MAPS[r.map],monsterName:MONSTERS[r.monsterType].name,elapsed:r.time});
 }
},80);
server.listen(process.env.PORT||3000);
