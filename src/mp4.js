// ISO-BMFF muxing for WebCodecs AVC/AAC output. No network or server required.
const encoder=new TextEncoder();
const str=s=>encoder.encode(s);
const u8=(...n)=>new Uint8Array(n);
const u16=n=>{const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,n);return b;};
const u32=n=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n>>>0);return b;};
const zeros=n=>new Uint8Array(n);
function cat(...parts){const out=new Uint8Array(parts.reduce((s,p)=>s+p.byteLength,0));let at=0;for(const p of parts){out.set(p,at);at+=p.byteLength;}return out;}
function box(type,...data){const b=cat(...data);return cat(u32(b.length+8),str(type),b);}
function full(type,version,flags,...data){return box(type,u8(version,(flags>>>16)&255,(flags>>>8)&255,flags&255),...data);}
const matrix=()=>cat(u32(0x10000),u32(0),u32(0),u32(0),u32(0x10000),u32(0),u32(0),u32(0),u32(0x40000000));
function descriptor(tag,data){let n=data.length,parts=[n&127];while((n>>>=7)>0)parts.unshift((n&127)|128);return cat(u8(tag,...parts),data);}
function avcEntry(track){return box('avc1',zeros(6),u16(1),zeros(16),u16(track.width),u16(track.height),u32(0x480000),u32(0x480000),u32(0),u16(1),zeros(32),u16(24),u16(0xffff),box('avcC',new Uint8Array(track.config)));}
function aacEntry(track){
 const asc=new Uint8Array(track.config||[0x11,0x90]);
 const decoder=descriptor(4,cat(u8(0x40,0x15),u8(0,0,0),u32(192000),u32(192000),descriptor(5,asc)));
 const es=descriptor(3,cat(u16(track.id),u8(0),decoder,descriptor(6,u8(2))));
 return box('mp4a',zeros(6),u16(1),zeros(8),u16(track.channels||2),u16(16),u16(0),u16(0),u32(track.timescale*65536),full('esds',0,0,es));
}
function opusEntry(track){
 const bytes=new Uint8Array(track.config||[]);let preSkip=312,rate=48000,gain=0,channels=track.channels||2;
 if(bytes.length>=19){const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);channels=bytes[9]||channels;preSkip=d.getUint16(10,true);rate=d.getUint32(12,true)||48000;gain=d.getInt16(16,true);}
 const dops=box('dOps',u8(0,channels),u16(preSkip),u32(rate),u16(gain&0xffff),u8(0));
 return box('Opus',zeros(6),u16(1),zeros(8),u16(channels),u16(16),u16(0),u16(0),u32(48000*65536),dops);
}
function stts(samples){const runs=[];for(const s of samples){const duration=Math.max(1,Math.round(s.duration));const last=runs.at(-1);if(last&&last[1]===duration)last[0]++;else runs.push([1,duration]);}return full('stts',0,0,u32(runs.length),...runs.map(([n,d])=>cat(u32(n),u32(d))));}
function makeTrack(t){
 const duration=t.samples.reduce((n,s)=>n+s.duration,0),present=t.presentationDuration??duration,ms=Math.ceil(present/t.timescale*1000);
 const tkhd=full('tkhd',0,7,u32(0),u32(0),u32(t.id),u32(0),u32(ms),zeros(8),u16(0),u16(0),u16(t.kind==='audio'?0x100:0),u16(0),matrix(),u32((t.width||0)*65536),u32((t.height||0)*65536));
 const mdhd=full('mdhd',0,0,u32(0),u32(0),u32(t.timescale),u32(duration),u16(0x55c4),u16(0));
 const hdlr=full('hdlr',0,0,u32(0),str(t.kind==='audio'?'soun':'vide'),zeros(12),str(t.kind==='audio'?'SoundHandler\0':'VideoHandler\0'));
 const stsd=full('stsd',0,0,u32(1),t.kind==='audio'?(t.codec==='opus'?opusEntry(t):aacEntry(t)):avcEntry(t));
 const stsc=full('stsc',0,0,u32(1),u32(1),u32(t.samples.length),u32(1));
 const stsz=full('stsz',0,0,u32(0),u32(t.samples.length),...t.samples.map(s=>u32(s.data.length)));
 const stco=full('stco',0,0,u32(1),u32(t.offset));
 const keys=t.samples.map((s,i)=>s.key?i+1:0).filter(Boolean);
 const stbl=box('stbl',stsd,stts(t.samples),stsc,stsz,stco,...(t.kind==='video'?[full('stss',0,0,u32(keys.length),...keys.map(u32))]:[]));
 const dinf=box('dinf',full('dref',0,0,u32(1),full('url ',0,1)));
 const media=t.kind==='audio'?full('smhd',0,0,u16(0),u16(0)):full('vmhd',0,1,zeros(8));
 const edits=present!==duration?[box('edts',full('elst',0,0,u32(1),u32(ms),u32(0),u16(1),u16(0)))]:[];
 return box('trak',tkhd,...edits,box('mdia',mdhd,hdlr,box('minf',media,dinf,stbl)));
}
export function muxMP4(video,audio){
 const ftyp=box('ftyp',str('isom'),u32(512),str('isomiso2avc1mp41'));
 const tracks=[{...video,kind:'video',id:1},...(audio?.samples.length?[{...audio,kind:'audio',id:2}]:[])];
 let offset=ftyp.length+8;for(const t of tracks){t.offset=offset;offset+=t.samples.reduce((n,s)=>n+s.data.length,0);}
 const duration=Math.max(...tracks.map(t=>(t.presentationDuration??t.samples.reduce((n,s)=>n+s.duration,0))/t.timescale*1000));
 const mvhd=full('mvhd',0,0,u32(0),u32(0),u32(1000),u32(Math.ceil(duration)),u32(0x10000),u16(0x100),zeros(10),matrix(),zeros(24),u32(tracks.length+1));
 const moov=box('moov',mvhd,...tracks.map(makeTrack));
 const mdatHeader=cat(u32(offset-ftyp.length),str('mdat'));
 return new Blob([ftyp,mdatHeader,...tracks.flatMap(t=>t.samples.map(s=>s.data)),moov],{type:'video/mp4'});
}
