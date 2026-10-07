'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const qr=require('../public/vendor/qrcode');
const decode=require('./qr-decoder/package/dist/jsQR');
const policy=require('../public/policy');
test('bundled offline QR decodes to the complete HTTPS student link',()=>{
  const url='https://surrender-peach.vercel.app/?scan=1';
  const code=qr(0,'M');code.addData(url);code.make();
  const count=code.getModuleCount(),scale=6,quiet=4,width=(count+quiet*2)*scale;
  const pixels=new Uint8ClampedArray(width*width*4).fill(255);
  for(let y=0;y<count;y++)for(let x=0;x<count;x++)if(code.isDark(y,x)) {
    for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++) {
      const i=(((y+quiet)*scale+dy)*width+(x+quiet)*scale+dx)*4;
      pixels[i]=pixels[i+1]=pixels[i+2]=0;
    }
  }
  assert.equal(decode(pixels,width,width).data,url);
});
test('offline browser maintenance closes stale records at 6 PM and removes 30-day history',()=>{
  const now=Date.parse('2026-10-07T18:05:00+08:00');
  const records=policy.maintain([
    {id:'today',active:true,surrenderedAt:'2026-10-07T08:00:00+08:00'},
    {id:'expired',active:false,surrenderedAt:'2026-09-01T08:00:00+08:00',returnedAt:'2026-09-01T18:00:00+08:00'},
    {id:'recent',active:false,surrenderedAt:'2026-10-06T08:00:00+08:00',returnedAt:'2026-10-06T17:00:00+08:00'}
  ],now);
  assert.equal(records.length,2);assert.equal(records[0].active,false);assert.equal(records[0].returnedAt,'2026-10-07T10:00:00.000Z');
});
