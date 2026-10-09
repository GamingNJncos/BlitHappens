var img=null,boxes=[],rows=[],selected=new Set(),previewTimer=null,frameDelays={};

function M(t){document.getElementById('msg').textContent=t}

function showTab(name){
 document.getElementById('tab-editor').style.display=name==='editor'?'':'none';
 document.getElementById('tab-settings').style.display=name==='settings'?'':'none';
 document.querySelectorAll('.tab').forEach(function(t){
  t.classList.toggle('active',t.textContent.toLowerCase()===name);
 });
}

function loadSettings(){
 var s=JSON.parse(localStorage.getItem('blithappens-settings')||'{}');
 var enabled=!!s.trgbEnabled;
 var ip=s.deviceIp||'';
 document.getElementById('trgbEnabled').checked=enabled;
 document.getElementById('settingsIp').value=ip;
 document.getElementById('deviceIp').value=ip;
 applyDeviceVisibility(enabled);
 if(enabled)document.getElementById('trgbSettings').style.display='';
}

function saveSettings(){
 var enabled=document.getElementById('trgbEnabled').checked;
 var ip=document.getElementById('settingsIp').value||'';
 localStorage.setItem('blithappens-settings',JSON.stringify({trgbEnabled:enabled,deviceIp:ip}));
 document.getElementById('deviceIp').value=ip;
 document.getElementById('trgbSettings').style.display=enabled?'':'none';
 applyDeviceVisibility(enabled);
}

function applyDeviceVisibility(enabled){
 document.querySelectorAll('.device-only').forEach(function(el){
  el.style.display=enabled?'':'none';
 });
}

function testConnection(){
 var ip=document.getElementById('settingsIp').value;
 var st=document.getElementById('connStatus');
 st.textContent='Testing...';st.style.color='#e3b341';
 var x=new XMLHttpRequest();
 x.open('GET','http://'+ip+'/api/status');
 x.timeout=5000;
 x.onload=function(){
  if(x.status===200){
   var d=JSON.parse(x.responseText);
   st.textContent='Connected ('+d.store+', '+d.animTotal+' anims)';
   st.style.color='#7ee787';
  } else {
   st.textContent='HTTP '+x.status;st.style.color='#f85149';
  }
 };
 x.onerror=function(){st.textContent='Cannot reach device';st.style.color='#f85149'};
 x.ontimeout=function(){st.textContent='Timeout';st.style.color='#f85149'};
 x.send();
}

loadSettings();

document.getElementById('fileIn').addEventListener('change',function(e){
 var f=e.target.files[0];if(!f)return;
 var r=new FileReader();
 r.onload=function(ev){
  img=new Image();
  img.onload=function(){
   var c=document.getElementById('sheetCanvas');
   c.width=img.width;c.height=img.height;
   c.getContext('2d').drawImage(img,0,0);
   document.getElementById('animName').value=f.name.replace(/\.[^.]+$/,'');
   autoCalibrate();
   detect();
  };
  img.src=ev.target.result;
 };
 r.readAsDataURL(f);
});

function autoCalibrate(){
 var minDim=Math.min(img.width,img.height);
 var autoPx=Math.max(8,Math.round(minDim/25));
 document.getElementById('minPx').value=autoPx;
}

function findSprites(id,w,h,minSz){
 var visited=new Uint8Array(w*h),bx=[];
 for(var y=0;y<h;y++){for(var x=0;x<w;x++){
  var idx=y*w+x;
  if(visited[idx]||id.data[idx*4+3]<16)continue;
  var x0=x,y0=y,x1=x,y1=y,stack=[idx];
  while(stack.length>0){
   var ci=stack.pop();if(visited[ci])continue;visited[ci]=1;
   var cx=ci%w,cy=Math.floor(ci/w);
   if(cx<x0)x0=cx;if(cx>x1)x1=cx;if(cy<y0)y0=cy;if(cy>y1)y1=cy;
   if(cx>0&&!visited[ci-1]&&id.data[(ci-1)*4+3]>=16)stack.push(ci-1);
   if(cx<w-1&&!visited[ci+1]&&id.data[(ci+1)*4+3]>=16)stack.push(ci+1);
   if(cy>0&&!visited[ci-w]&&id.data[(ci-w)*4+3]>=16)stack.push(ci-w);
   if(cy<h-1&&!visited[ci+w]&&id.data[(ci+w)*4+3]>=16)stack.push(ci+w);
  }
  var bw=x1-x0+1,bh=y1-y0+1;
  if(bw>=minSz&&bh>=minSz)bx.push({x:x0,y:y0,w:bw,h:bh,idx:bx.length});
 }}
 bx.sort(function(a,b){return a.y===b.y?a.x-b.x:a.y-b.y});
 for(var i=0;i<bx.length;i++)bx[i].idx=i;
 return bx;
}

function detectEdgeBG(id,w,h){
 var counts={};
 function key(r,g,b){return((r>>3)<<10)|((g>>3)<<5)|(b>>3)}
 for(var x=0;x<w;x++){
  var i1=x*4,i2=((h-1)*w+x)*4;
  counts[key(id.data[i1],id.data[i1+1],id.data[i1+2])]=(counts[key(id.data[i1],id.data[i1+1],id.data[i1+2])]||0)+1;
  counts[key(id.data[i2],id.data[i2+1],id.data[i2+2])]=(counts[key(id.data[i2],id.data[i2+1],id.data[i2+2])]||0)+1;
 }
 for(var y=0;y<h;y++){
  var i1=(y*w)*4,i2=(y*w+w-1)*4;
  counts[key(id.data[i1],id.data[i1+1],id.data[i1+2])]=(counts[key(id.data[i1],id.data[i1+1],id.data[i1+2])]||0)+1;
  counts[key(id.data[i2],id.data[i2+1],id.data[i2+2])]=(counts[key(id.data[i2],id.data[i2+1],id.data[i2+2])]||0)+1;
 }
 var bestK=null,bestN=0;
 for(var k in counts){if(counts[k]>bestN){bestN=counts[k];bestK=k}}
 if(!bestK)return{r:0,g:0,b:0};
 var kv=parseInt(bestK);
 return{r:(kv>>10)<<3,g:((kv>>5)&31)<<3,b:(kv&31)<<3};
}

function detect(){
 if(!img){M('Load an image first');return}
 var minSz=parseInt(document.getElementById('minPx').value)||16;
 var tol=parseInt(document.getElementById('bgTol').value)||30;
 var cv=document.getElementById('workCanvas');cv.width=img.width;cv.height=img.height;
 var ctx=cv.getContext('2d',{willReadFrequently:true});
 ctx.clearRect(0,0,img.width,img.height);ctx.drawImage(img,0,0);
 var id=ctx.getImageData(0,0,img.width,img.height);
 var hasAlpha=false;
 for(var i=3;i<id.data.length;i+=4){if(id.data[i]<240){hasAlpha=true;break;}}
 var bgInfo='';
 if(!hasAlpha){
  var bg=detectEdgeBG(id,img.width,img.height);
  bgInfo=' BG:rgb('+bg.r+','+bg.g+','+bg.b+')';
  for(var i=0;i<id.data.length;i+=4){
   var dr=Math.abs(id.data[i]-bg.r),dg=Math.abs(id.data[i+1]-bg.g),db=Math.abs(id.data[i+2]-bg.b);
   if(dr<tol&&dg<tol&&db<tol)id.data[i+3]=0;
  }
 }
 var rawBoxes=findSprites(id,img.width,img.height,Math.max(4,Math.floor(minSz/4)));
 var imgArea=img.width*img.height;
 var preFilter=rawBoxes.filter(function(b){
  var aspect=Math.max(b.w,b.h)/Math.min(b.w,b.h);
  if(aspect>8&&b.w*b.h<imgArea*0.005)return false;
  return true;
 });
 var rawRows=[],cr=[preFilter[0]];
 for(var i=1;i<preFilter.length;i++){
  var b=preFilter[i],prev=cr[0];
  if(b.y>=prev.y+prev.h+minSz){rawRows.push(cr);cr=[b];}
  else cr.push(b);
 }
 if(preFilter.length>0)rawRows.push(cr);
 rows=[];boxes=[];
 rawRows.forEach(function(row){
  var maxW=0,maxH=0;
  row.forEach(function(b){if(b.w>maxW)maxW=b.w;if(b.h>maxH)maxH=b.h});
  if(maxW>=minSz&&maxH>=minSz){
   row.forEach(function(b){b.idx=boxes.length;boxes.push(b)});
   rows.push(row);
  }
 });
 if(boxes.length===0){M('No sprites detected.'+bgInfo+' Try adjusting Min px or BG tolerance.');return}
 selected=new Set();frameDelays={};
 var baseDly=parseInt(document.getElementById('delayMs').value)||100;
 for(var i=0;i<boxes.length;i++){selected.add(i);frameDelays[i]=baseDly;}
 drawOverlay();buildRowList();updatePreview();
 M(boxes.length+' sprites in '+rows.length+' rows.'+bgInfo+' Click to select/deselect.');
}

function drawOverlay(){
 var c=document.getElementById('sheetCanvas'),ctx=c.getContext('2d');
 ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);
 for(var i=0;i<boxes.length;i++){
  var b=boxes[i],sel=selected.has(i);
  ctx.strokeStyle=sel?'#7ee787':'#ff6b6b';ctx.lineWidth=sel?2:1;
  ctx.strokeRect(b.x,b.y,b.w,b.h);
  if(sel){ctx.fillStyle='rgba(126,231,135,0.15)';ctx.fillRect(b.x,b.y,b.w,b.h);}
 }
}

function buildRowList(){
 var html='';
 rows.forEach(function(row,ri){
  var allSel=row.every(function(b){return selected.has(b.idx)});
  var someSel=row.some(function(b){return selected.has(b.idx)});
  var maxW=0,maxH=0;
  row.forEach(function(b){if(b.w>maxW)maxW=b.w;if(b.h>maxH)maxH=b.h});
  html+='<div class="row-group"><div class="row-header" onclick="toggleRow('+ri+')">';
  html+='<input type="checkbox" '+(allSel?'checked':'')+(someSel&&!allSel?' style="opacity:0.5"':'')+' onclick="event.stopPropagation();toggleRow('+ri+')">';
  html+='<strong>Row '+(ri+1)+'</strong> <span>'+row.length+' sprites, max '+maxW+'x'+maxH+'</span></div>';
  html+='<div class="delay-ctrl"><label>Row delay:</label>';
  html+='<input type="number" value="'+(frameDelays[row[0].idx]||100)+'" min="16" max="5000" onchange="setRowDelay('+ri+',this.value)"> ms</div>';
  html+='<div class="sprites">';
  row.forEach(function(b){
   var scale=48/Math.max(b.w,b.h);
   var tw=Math.max(1,Math.round(b.w*scale)),th=Math.max(1,Math.round(b.h*scale));
   var dly=frameDelays[b.idx]||100;
   html+='<div class="sprite-thumb'+(selected.has(b.idx)?' selected':'')+'" onclick="toggleSprite('+b.idx+')" title="'+(b.idx+1)+': '+b.w+'x'+b.h+' @ '+dly+'ms">';
   html+='<canvas width="'+tw+'" height="'+th+'" data-bx="'+b.x+'" data-by="'+b.y+'" data-bw="'+b.w+'" data-bh="'+b.h+'"></canvas>';
   html+='<span class="idx">'+(b.idx+1)+'</span>';
   html+='<span class="dly">'+dly+'</span></div>';
  });
  html+='</div></div>';
 });
 document.getElementById('rowList').innerHTML=html;
 document.querySelectorAll('.sprite-thumb canvas').forEach(function(c){
  var ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;
  ctx.drawImage(img,+c.dataset.bx,+c.dataset.by,+c.dataset.bw,+c.dataset.bh,0,0,c.width,c.height);
 });
}

function toggleRow(ri){
 var row=rows[ri],allSel=row.every(function(b){return selected.has(b.idx)});
 row.forEach(function(b){if(allSel)selected.delete(b.idx);else selected.add(b.idx)});
 drawOverlay();buildRowList();updatePreview();
}

function toggleSprite(idx){
 if(selected.has(idx))selected.delete(idx);else selected.add(idx);
 drawOverlay();buildRowList();updatePreview();
}

function selectAll(){boxes.forEach(function(b){selected.add(b.idx)});drawOverlay();buildRowList();updatePreview();}
function selectNone(){selected.clear();drawOverlay();buildRowList();updatePreview();}

function setRowDelay(ri,val){
 var ms=parseInt(val)||100;if(ms<16)ms=16;
 rows[ri].forEach(function(b){frameDelays[b.idx]=ms});
 buildRowList();updatePreview();
}

var previewFrame=0;
function updatePreview(){
 var sel=boxes.filter(function(b){return selected.has(b.idx)});
 document.getElementById('selCount').textContent=sel.length;
 if(previewTimer){clearTimeout(previewTimer);previewTimer=null;}
 var pc=document.getElementById('previewCanvas');
 if(sel.length===0){pc.getContext('2d').clearRect(0,0,pc.width,pc.height);return}
 var maxW=0,maxH=0;
 sel.forEach(function(b){if(b.w>maxW)maxW=b.w;if(b.h>maxH)maxH=b.h});
 var scale=Math.min(200/maxW,200/maxH);
 pc.width=Math.round(maxW*scale);pc.height=Math.round(maxH*scale);
 previewFrame=0;
 var drawFrame=function(){
  var b=sel[previewFrame%sel.length];
  var ctx=pc.getContext('2d');ctx.imageSmoothingEnabled=false;
  ctx.clearRect(0,0,pc.width,pc.height);
  var sw=Math.round(b.w*scale),sh=Math.round(b.h*scale);
  var dx=Math.floor((pc.width-sw)/2),dy=Math.floor((pc.height-sh)/2);
  ctx.drawImage(img,b.x,b.y,b.w,b.h,dx,dy,sw,sh);
  var dly=frameDelays[b.idx]||100;
  previewFrame++;
  previewTimer=setTimeout(drawFrame,dly);
 };
 drawFrame();
}

function buildBinary(){
 var sel=boxes.filter(function(b){return selected.has(b.idx)});
 if(sel.length===0){M('No sprites selected');return null;}
 var maxW=0,maxH=0;
 sel.forEach(function(b){if(b.w>maxW)maxW=b.w;if(b.h>maxH)maxH=b.h});
 var scale=1.0;
 if(maxW>478||maxH>478)scale=Math.min(478/maxW,478/maxH);
 var outW=Math.round(maxW*scale),outH=Math.round(maxH*scale);
 if(outW>478)outW=478;if(outH>478)outH=478;
 var nf=sel.length,bpf=outW*outH*3,maxUp=4*1024*1024;
 if(nf*bpf>maxUp){nf=Math.floor(maxUp/bpf);if(nf<1)nf=1;}
 var out=new Uint8Array(nf*bpf),off=0;
 var cv=document.getElementById('workCanvas');cv.width=outW;cv.height=outH;
 var ctx=cv.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;
 for(var i=0;i<nf;i++){
  var b=sel[i];ctx.clearRect(0,0,outW,outH);
  var sw=Math.round(b.w*scale),sh=Math.round(b.h*scale);
  var dx=Math.floor((outW-sw)/2),dy=Math.floor((outH-sh)/2);
  ctx.drawImage(img,b.x,b.y,b.w,b.h,dx,dy,sw,sh);
  var fd=ctx.getImageData(0,0,outW,outH),px=fd.data;
  for(var j=0;j<px.length;j+=4){
   var v=((px[j]>>3)<<11)|((px[j+1]>>2)<<5)|(px[j+2]>>3);
   out[off++]=v&0xFF;out[off++]=(v>>8)&0xFF;out[off++]=px[j+3];
  }
 }
 return{data:out.subarray(0,off),fw:outW,fh:outH,nf:nf};
}

function saveLocal(){
 var bin=buildBinary();if(!bin)return;
 var name=document.getElementById('animName').value||'sprite';
 var blob=new Blob([bin.data],{type:'application/octet-stream'});
 var a=document.createElement('a');a.href=URL.createObjectURL(blob);
 a.download=name+'.sprbin';a.click();URL.revokeObjectURL(a.href);
 M('Saved '+name+'.sprbin ('+bin.nf+' frames '+bin.fw+'x'+bin.fh+', '+bin.data.length+' bytes)');
}

function uploadToDevice(){
 var bin=buildBinary();if(!bin)return;
 var name=document.getElementById('animName').value||'sprite';
 if(name.length>19)name=name.substring(0,19);
 var ip=document.getElementById('deviceIp').value;
 if(!ip){M('Enter device IP');return}
 var dly=parseInt(document.getElementById('delayMs').value)||100;
 var blob=new Blob([bin.data],{type:'application/octet-stream'});
 var fd=new FormData();fd.append('name',name);
 fd.append('fw',''+bin.fw);fd.append('fh',''+bin.fh);
 fd.append('nf',''+bin.nf);fd.append('dl',''+dly);
 fd.append('file',blob,'s.bin');
 M('Uploading '+bin.nf+' frames to '+ip+'...');
 var x=new XMLHttpRequest();
 x.onload=function(){M('Device: '+x.responseText)};
 x.onerror=function(){M('Upload failed - check IP and connection')};
 x.open('POST','http://'+ip+'/up/sprite');x.send(fd);
}

function devUrl(){return 'http://'+document.getElementById('deviceIp').value}

function listDeviceAnims(){
 var ip=document.getElementById('deviceIp').value;
 if(!ip){M('Enter device IP');return}
 M('Loading device animations...');
 fetch(devUrl()+'/list').then(function(r){return r.json()}).then(function(d){
  var el=document.getElementById('deviceAnims');
  if(!d.files||d.files.length===0){el.innerHTML='<span style="color:#8b949e;font-size:.85em">No animations on device</span>';return}
  var h='';
  d.files.forEach(function(f){
   if(!f.endsWith('.meta'))return;
   var name=f.split('/').pop().replace('.meta','');
   h+='<a style="display:block;padding:3px 0;color:#58a6ff;cursor:pointer;font-size:.85em" onclick="loadFromDevice(\''+f+'\',\''+name+'\')">'+name+'</a>';
  });
  el.innerHTML=h||'<span style="color:#8b949e;font-size:.85em">No sprite animations (only GIFs)</span>';
  M('Found '+d.files.length+' items on device');
 }).catch(function(){M('Cannot reach device at '+ip)});
}

function loadFromDevice(metaPath,name){
 M('Loading '+name+'...');
 var frmPath=metaPath.replace('.meta','.frm');
 var x=new XMLHttpRequest();
 x.open('GET',devUrl()+'/sdcard'+metaPath);
 x.onload=function(){
  if(x.status!==200){M('Meta fetch failed: '+x.status);return}
  var parts=x.responseText.trim().split(/\s+/);
  var fw=parseInt(parts[0]),fh=parseInt(parts[1]),nf=parseInt(parts[2]),dl=parseInt(parts[3])||100;
  document.getElementById('animName').value=name;
  document.getElementById('delayMs').value=dl;
  M('Downloading '+nf+' frames ('+fw+'x'+fh+')...');
  var x2=new XMLHttpRequest();
  x2.open('GET',devUrl()+'/sdcard'+frmPath);
  x2.responseType='arraybuffer';
  x2.onload=function(){
   if(x2.status!==200){M('Data fetch failed: '+x2.status);return}
   var data=new Uint8Array(x2.response);
   var bpf=fw*fh*3;
   var actualNf=Math.floor(data.length/bpf);
   if(actualNf<nf)nf=actualNf;
   M('Decoding '+nf+' frames...');
   var cv=document.createElement('canvas');cv.width=fw*nf;cv.height=fh;
   var ctx=cv.getContext('2d');
   for(var i=0;i<nf;i++){
    var id=ctx.createImageData(fw,fh);
    for(var j=0;j<fw*fh;j++){
     var off=i*bpf+j*3;
     var c=data[off]|(data[off+1]<<8);
     var a=data[off+2];
     id.data[j*4]=((c>>11)&0x1F)<<3;
     id.data[j*4+1]=((c>>5)&0x3F)<<2;
     id.data[j*4+2]=(c&0x1F)<<3;
     id.data[j*4+3]=a;
    }
    ctx.putImageData(id,i*fw,0);
   }
   img=new Image();
   img.onload=function(){
    var sc=document.getElementById('sheetCanvas');
    sc.width=img.width;sc.height=img.height;
    sc.getContext('2d').drawImage(img,0,0);
    document.getElementById('minPx').value=Math.max(4,Math.min(fw,fh)-2);
    document.getElementById('bgTol').value=10;
    detect();
    M('Loaded '+name+': '+nf+' frames '+fw+'x'+fh+' @'+dl+'ms');
   };
   img.src=cv.toDataURL();
  };
  x2.onerror=function(){M('Data download failed - check device IP')};
  x2.send();
 };
 x.onerror=function(){M('Cannot reach device - check IP')};
 x.send();
}