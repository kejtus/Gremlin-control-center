/**
 * ESP LiDAR WebGL — zgodny z Gremlin esp_lidar:
 * scena (-x, z, y), kolor 0..255, tilt na całym obiekcie, kamera ~pozioma / FOV 55°, siatka 40 m.
 */
export const LIDAR_GL_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<style>
  html,body{margin:0;height:100%;background:#0a0c10;overflow:hidden;touch-action:none}
  canvas{display:block;width:100%;height:100%}
  #hud{position:absolute;left:10px;top:8px;color:#9aa8b8;font:11px/1.35 system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 2px #000}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud">ESP LiDAR</div>
<script>
(function(){
  var canvas=document.getElementById('c');
  var hud=document.getElementById('hud');
  var gl=canvas.getContext('webgl',{antialias:true,alpha:false});
  if(!gl){document.body.innerHTML='<p style="color:#fff;padding:12px">Brak WebGL</p>';return;}

  var MAX=20000;
  var positions=new Float32Array(MAX*3);
  var colors=new Float32Array(MAX*3);
  var filled=0, dirty=true;

  // Korekta montażu — bliżej poziomu (−90/0/0); RN nadpisze zapisanymi preferencjami.
  var tiltX=-90, tiltY=0, tiltZ=0;

  function intensityRgb(intensity){
    var t=intensity/255; if(t<0)t=0; if(t>1)t=1;
    var b=[0.1,0.3,0.9], y=[0.95,0.8,0.2], r=[0.9,0.15,0.15];
    if(t<=0.5){
      var u=2*t;
      return [b[0]+(y[0]-b[0])*u, b[1]+(y[1]-b[1])*u, b[2]+(y[2]-b[2])*u];
    }
    var u=2*t-1;
    return [y[0]+(r[0]-y[0])*u, y[1]+(r[1]-y[1])*u, y[2]+(r[2]-y[2])*u];
  }

  // ESP → Three: (-x, z, y)
  function toScene(x,y,z){ return [-x, z, y]; }

  var vs=
    'attribute vec3 aPos; attribute vec3 aCol;'+
    'uniform mat4 uMVP; uniform float uSize;'+
    'varying vec3 vCol;'+
    'void main(){ vCol=aCol; gl_Position=uMVP*vec4(aPos,1.0); gl_PointSize=uSize; }';
  var fs=
    'precision mediump float; varying vec3 vCol;'+
    'void main(){ vec2 c=gl_PointCoord-vec2(0.5); if(dot(c,c)>0.25) discard;'+
    ' gl_FragColor=vec4(vCol,1.0); }';

  function compile(type,src){ var s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); return s; }
  var prog=gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  var aPos=gl.getAttribLocation(prog,'aPos');
  var aCol=gl.getAttribLocation(prog,'aCol');
  var uMVP=gl.getUniformLocation(prog,'uMVP');
  var uSize=gl.getUniformLocation(prog,'uSize');

  // Siatka podłogi (linie)
  var gridProg=gl.createProgram();
  var gvs='attribute vec3 aPos; uniform mat4 uMVP; void main(){ gl_Position=uMVP*vec4(aPos,1.0); }';
  var gfs='precision mediump float; uniform vec4 uColor; void main(){ gl_FragColor=uColor; }';
  gl.attachShader(gridProg, compile(gl.VERTEX_SHADER, gvs));
  gl.attachShader(gridProg, compile(gl.FRAGMENT_SHADER, gfs));
  gl.linkProgram(gridProg);
  var gaPos=gl.getAttribLocation(gridProg,'aPos');
  var guMVP=gl.getUniformLocation(gridProg,'uMVP');
  var guColor=gl.getUniformLocation(gridProg,'uColor');

  // ±20 m (40×40) — zasięg L1 często wykracza poza 10–15 m
  var gridVerts=[];
  var half=20, div=80, step=(half*2)/div;
  for(var i=0;i<=div;i++){
    var t=-half+i*step;
    gridVerts.push(t,0,-half, t,0,half);
    gridVerts.push(-half,0,t, half,0,t);
  }
  var gridArr=new Float32Array(gridVerts);
  var gridBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,gridBuf);
  gl.bufferData(gl.ARRAY_BUFFER,gridArr,gl.STATIC_DRAW);
  var gridCount=gridVerts.length/3;

  var posBuf=gl.createBuffer(), colBuf=gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,posBuf); gl.bufferData(gl.ARRAY_BUFFER,positions,gl.DYNAMIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,colBuf); gl.bufferData(gl.ARRAY_BUFFER,colors,gl.DYNAMIC_DRAW);

  // Kamera: mniej „w dół” niż stary pitch 0.55 — prawie poziomy orbit
  var yaw=0.25, pitch=0.28, dist=4;
  var dragging=false, lastX=0, lastY=0, pinch0=0, dist0=4;

  function resize(){
    var dpr=Math.min(2, window.devicePixelRatio||1);
    var w=canvas.clientWidth|0, h=canvas.clientHeight|0;
    if(canvas.width!==((w*dpr)|0)||canvas.height!==((h*dpr)|0)){
      canvas.width=(w*dpr)|0; canvas.height=(h*dpr)|0;
      gl.viewport(0,0,canvas.width,canvas.height);
    }
  }

  function perspective(out,fovy,aspect,near,far){
    var f=1/Math.tan(fovy/2), nf=1/(near-far);
    out[0]=f/aspect;out[1]=0;out[2]=0;out[3]=0;
    out[4]=0;out[5]=f;out[6]=0;out[7]=0;
    out[8]=0;out[9]=0;out[10]=(far+near)*nf;out[11]=-1;
    out[12]=0;out[13]=0;out[14]=2*far*near*nf;out[15]=0;
  }
  function lookAt(out,eye,center,up){
    var zx=eye[0]-center[0],zy=eye[1]-center[1],zz=eye[2]-center[2];
    var len=Math.hypot(zx,zy,zz)||1; zx/=len;zy/=len;zz/=len;
    var xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;
    len=Math.hypot(xx,xy,xz)||1; xx/=len;xy/=len;xz/=len;
    var yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
    out[0]=xx;out[1]=yx;out[2]=zx;out[3]=0;
    out[4]=xy;out[5]=yy;out[6]=zy;out[7]=0;
    out[8]=xz;out[9]=yz;out[10]=zz;out[11]=0;
    out[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
    out[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
    out[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
    out[15]=1;
  }
  function mul(out,a,b){
    var a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7];
    var a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    for(var i=0;i<4;i++){
      var bi=i*4,x=b[bi],y=b[bi+1],z=b[bi+2],w=b[bi+3];
      out[bi]=x*a00+y*a10+z*a20+w*a30;
      out[bi+1]=x*a01+y*a11+z*a21+w*a31;
      out[bi+2]=x*a02+y*a12+z*a22+w*a32;
      out[bi+3]=x*a03+y*a13+z*a23+w*a33;
    }
  }
  var P=new Float32Array(16), V=new Float32Array(16), MVP=new Float32Array(16);
  var lastFlat=null;

  /** Euler X→Y→Z jak viewer.js — na całej chmurze po remap osi. */
  function mountTilt(x,y,z){
    var rx=tiltX*Math.PI/180, ry=tiltY*Math.PI/180, rz=tiltZ*Math.PI/180;
    var cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);
    var y1=cx*y-sx*z, z1=sx*y+cx*z; y=y1; z=z1;
    var x2=cy*x+sy*z, z2=-sy*x+cy*z; x=x2; z=z2;
    var x3=cz*x-sz*y, y3=sz*x+cz*y;
    return [x3,y3,z];
  }

  function rebuild(){
    if(!lastFlat || !lastFlat.length){ filled=0; dirty=true; if(hud) hud.textContent='brak skanu'; return; }
    var nIn=Math.floor(lastFlat.length/4);
    var n=Math.min(MAX, nIn);
    var w=0;
    for(var i=0;i<n;i++){
      var o=i*4;
      var x=lastFlat[o], y=lastFlat[o+1], z=lastFlat[o+2], inten=lastFlat[o+3];
      if(!isFinite(x)||!isFinite(y)||!isFinite(z)) continue;
      var s=toScene(x,y,z||0);
      var t=mountTilt(s[0],s[1],s[2]);
      var rgb=intensityRgb(isFinite(inten)?inten:128);
      var p=w*3;
      positions[p]=t[0]; positions[p+1]=t[1]; positions[p+2]=t[2];
      colors[p]=rgb[0]; colors[p+1]=rgb[1]; colors[p+2]=rgb[2];
      w++;
    }
    filled=w;
    dirty=true;
    if(hud) hud.textContent=w.toLocaleString('pl-PL')+' pkt · orbit / pinch';
  }

  /** Raw flat [x,y,z,i,...] z ESP. */
  function setCloudFlat(flat){
    if(!flat || !flat.length){ lastFlat=null; clearCloud(); return; }
    lastFlat=flat;
    rebuild();
  }

  function setCloudB64(b64){
    try{
      var bin=atob(b64);
      var buf=new ArrayBuffer(bin.length);
      var u8=new Uint8Array(buf);
      for(var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
      setCloudFlat(new Float32Array(buf));
    }catch(e){}
  }

  function clearCloud(){
    lastFlat=null; filled=0; dirty=true;
    if(hud) hud.textContent='brak skanu';
  }

  function notifyView(){
    try{
      var payload=JSON.stringify({type:'view',yaw:yaw,pitch:pitch,dist:dist,tiltX:tiltX,tiltY:tiltY,tiltZ:tiltZ});
      if(window.ReactNativeWebView&&window.ReactNativeWebView.postMessage){
        window.ReactNativeWebView.postMessage(payload);
      }else if(window.parent&&window.parent!==window){
        window.parent.postMessage(payload,'*');
      }
    }catch(e){}
  }
  function setTilt(x,y,z){ tiltX=x; tiltY=y; tiltZ=z; rebuild(); }
  function setCamera(y,p,d){
    if(isFinite(y)) yaw=y;
    if(isFinite(p)){ pitch=p; if(pitch<0.08) pitch=0.08; if(pitch>1.45) pitch=1.45; }
    if(isFinite(d)){ dist=d; if(dist<0.6) dist=0.6; if(dist>45) dist=45; }
  }
  function resetTilt(){ tiltX=-90; tiltY=0; tiltZ=0; rebuild(); }
  function resetCamera(){ yaw=0.25; pitch=0.28; dist=4; }

  function upload(){
    if(!dirty) return;
    dirty=false;
    gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,positions.subarray(0,filled*3));
    gl.bindBuffer(gl.ARRAY_BUFFER,colBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,colors.subarray(0,filled*3));
  }

  function frame(){
    resize(); upload();
    gl.clearColor(0.039,0.047,0.063,1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    var aspect=canvas.width/Math.max(1,canvas.height);
    perspective(P, 55*Math.PI/180, aspect, 0.05, 120);
    var cp=Math.cos(pitch), sp=Math.sin(pitch);
    var cy=Math.cos(yaw), sy=Math.sin(yaw);
    var eye=[dist*cp*sy, dist*sp, dist*cp*cy];
    lookAt(V, eye, [0,0,0], [0,1,0]);
    mul(MVP,P,V);

    // siatka
    gl.useProgram(gridProg);
    gl.uniformMatrix4fv(guMVP,false,MVP);
    gl.uniform4f(guColor,0.22,0.28,0.36,1);
    gl.bindBuffer(gl.ARRAY_BUFFER,gridBuf);
    gl.enableVertexAttribArray(gaPos);
    gl.vertexAttribPointer(gaPos,3,gl.FLOAT,false,0,0);
    gl.drawArrays(gl.LINES,0,gridCount);

    // punkty
    gl.useProgram(prog);
    gl.uniformMatrix4fv(uMVP,false,MVP);
    gl.uniform1f(uSize, filled>12000 ? 2.6 : 3.5);
    gl.bindBuffer(gl.ARRAY_BUFFER,posBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,colBuf);
    gl.enableVertexAttribArray(aCol);
    gl.vertexAttribPointer(aCol,3,gl.FLOAT,false,0,0);
    if(filled>0) gl.drawArrays(gl.POINTS,0,filled);

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function touchDist(t){ return Math.hypot(t[0].clientX-t[1].clientX, t[0].clientY-t[1].clientY); }
  canvas.addEventListener('touchstart',function(e){
    e.preventDefault();
    if(e.touches.length===1){ dragging=true; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; }
    else if(e.touches.length>=2){ dragging=true; pinch0=touchDist(e.touches); dist0=dist; }
  },{passive:false});
  canvas.addEventListener('touchmove',function(e){
    e.preventDefault();
    if(e.touches.length>=2){
      var d=touchDist(e.touches);
      if(pinch0>1) dist=Math.max(0.6, Math.min(45, dist0*(pinch0/d)));
      return;
    }
    if(!dragging||!e.touches.length) return;
    var x=e.touches[0].clientX, y=e.touches[0].clientY;
    yaw-=(x-lastX)*0.005;
    pitch+=(y-lastY)*0.005;
    if(pitch<0.08) pitch=0.08; if(pitch>1.45) pitch=1.45;
    lastX=x; lastY=y;
  },{passive:false});
  canvas.addEventListener('touchend',function(){ dragging=false; notifyView(); });
  canvas.addEventListener('touchcancel',function(){ dragging=false; notifyView(); });
  canvas.addEventListener('mousedown',function(e){ dragging=true; lastX=e.clientX; lastY=e.clientY; });
  window.addEventListener('mouseup',function(){ if(dragging){ dragging=false; notifyView(); } else dragging=false; });
  window.addEventListener('mousemove',function(e){
    if(!dragging) return;
    yaw-=(e.clientX-lastX)*0.005;
    pitch+=(e.clientY-lastY)*0.005;
    if(pitch<0.08) pitch=0.08; if(pitch>1.45) pitch=1.45;
    lastX=e.clientX; lastY=e.clientY;
  });
  canvas.addEventListener('wheel',function(e){
    e.preventDefault();
    dist=Math.max(0.6, Math.min(45, dist*(e.deltaY>0?1.08:0.92)));
    notifyView();
  },{passive:false});

  window.setCloudB64=setCloudB64;
  window.setCloud=setCloudFlat;
  window.clearCloud=clearCloud;
  window.setTilt=setTilt;
  window.setCamera=setCamera;
  window.resetTilt=resetTilt;
  window.resetCamera=resetCamera;

  function onMsg(raw){
    try{
      var msg=typeof raw==='string'?JSON.parse(raw):(typeof raw.data==='string'?JSON.parse(raw.data):raw);
      if(!msg) return;
      if(msg.type==='b64') setCloudB64(msg.data);
      if(msg.type==='points') setCloudFlat(msg.data);
      if(msg.type==='clear') clearCloud();
      if(msg.type==='tilt'){ tiltX=msg.x; tiltY=msg.y; tiltZ=msg.z; rebuild(); }
      if(msg.type==='cam') setCamera(msg.yaw, msg.pitch, msg.dist);
      if(msg.type==='resetTilt') resetTilt();
      if(msg.type==='resetCam') resetCamera();
    }catch(e){}
  }
  document.addEventListener('message',function(e){ onMsg(e.data); });
  window.addEventListener('message',function(e){ onMsg(e.data); });
})();
</script>
</body>
</html>`;
