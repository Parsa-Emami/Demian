export function referralQrMatrix(text){
    const data=new TextEncoder().encode(text);
    if(data.length>134)throw new RangeError('Invitation URL too long for local QR');
    const bits=[];
    const put=(v,n)=>{for(let i=n-1;i>=0;i--)bits.push((v>>>i)&1);};
    put(4,4);put(data.length,8);for(const b of data)put(b,8);
    put(0,Math.min(4,1088-bits.length));while(bits.length%8)bits.push(0);
    const bytes=[];for(let i=0;i<bits.length;i+=8)bytes.push(bits.slice(i,i+8).reduce((a,b)=>a*2+b,0));
    for(let pad=0;bytes.length<136;pad++)bytes.push(pad%2?17:236);
    const mul=(x,y)=>{let z=0;while(y){if(y&1)z^=x;y>>>=1;x<<=1;if(x&256)x^=285;}return z;};
    let gen=[1],root=1;
    for(let i=0;i<18;i++){const tmp=Array(gen.length+1).fill(0);for(let j=0;j<gen.length;j++){tmp[j]^=gen[j];tmp[j+1]^=mul(gen[j],root);}gen=tmp;root=mul(root,2);}
    const blocks=[bytes.slice(0,68),bytes.slice(68)];
    const ecc=blocks.map(block=>{const out=block.concat(Array(18).fill(0));for(let i=0;i<68;i++){const factor=out[i];for(let j=0;j<gen.length;j++)out[i+j]^=mul(gen[j],factor);}return out.slice(68);});
    const words=[];for(let i=0;i<68;i++)for(const b of blocks)words.push(b[i]);for(let i=0;i<18;i++)for(const b of ecc)words.push(b[i]);
    const n=41,m=Array.from({length:n},()=>Array(n).fill(null));
    const set=(x,y,b)=>{if(x>=0&&y>=0&&x<n&&y<n)m[y][x]=b?1:0;};
    for(const [cx,cy] of [[3,3],[37,3],[3,37]])for(let y=-4;y<=4;y++)for(let x=-4;x<=4;x++){const d=Math.max(Math.abs(x),Math.abs(y));set(cx+x,cy+y,d!==2&&d!==4);}
    for(let i=0;i<n;i++){if(m[6][i]===null)set(i,6,i%2===0);if(m[i][6]===null)set(6,i,i%2===0);}
    for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++)set(34+x,34+y,Math.max(Math.abs(x),Math.abs(y))!==1);
    const format=0x77c4,f=i=>(format>>>i)&1;
    for(let i=0;i<6;i++)set(8,i,f(i));set(8,7,f(6));set(8,8,f(7));set(7,8,f(8));
    for(let i=9;i<15;i++)set(14-i,8,f(i));for(let i=0;i<8;i++)set(n-1-i,8,f(i));for(let i=8;i<15;i++)set(8,n-15+i,f(i));set(8,n-8,1);
    let pos=0;
    for(let right=n-1;right>=1;right-=2){if(right===6)right=5;const up=((right+1)&2)===0;
        for(let vert=0;vert<n;vert++){const y=up?n-1-vert:vert;for(let j=0;j<2;j++){const x=right-j;if(m[y][x]!==null)continue;const b=pos<words.length*8?(words[pos>>>3]>>>(7-(pos&7)))&1:0;set(x,y,b^((x+y)%2===0?1:0));pos++;}}}
    return m;
}
export function drawReferralQr(canvas,text){
    const matrix=referralQrMatrix(text),scale=5,border=4;
    canvas.width=canvas.height=(matrix.length+2*border)*scale;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Canvas unavailable');
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';
    matrix.forEach((row,y)=>row.forEach((bit,x)=>{if(bit)ctx.fillRect((x+border)*scale,(y+border)*scale,scale,scale);}));
}
