// WAV (RIFF) encoder / decoder. PCM 16 / 24-bit and IEEE float 32-bit.

export type WavBitDepth = 16 | 24 | 32;

export interface PcmAudio {
  sampleRate: number;
  channels: Float32Array[];
}

/** TPDF dither amplitude for 16-bit (±1 LSB triangular). */
function tpdf(): number {
  return (Math.random() - Math.random()) / 32768;
}

export function encodeWav(audio: PcmAudio, bitDepth: WavBitDepth = 24, dither = true): Uint8Array {
  const { sampleRate, channels } = audio;
  const nCh = channels.length;
  const len = channels[0]?.length ?? 0;
  const bytesPer = bitDepth / 8;
  const dataSize = len * nCh * bytesPer;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + dataSize, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true);
  v.setUint16(20, bitDepth === 32 ? 3 : 1, true);
  v.setUint16(22, nCh, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * nCh * bytesPer, true); v.setUint16(32, nCh * bytesPer, true); v.setUint16(34, bitDepth, true);
  str(36, "data"); v.setUint32(40, dataSize, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nCh; c++) {
      let x = channels[c][i];
      if (bitDepth === 32) {
        v.setFloat32(o, x, true);
      } else if (bitDepth === 16) {
        if (dither) x += tpdf();
        const s = Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
        v.setInt16(o, s, true);
      } else {
        const s = Math.max(-8388608, Math.min(8388607, Math.round(x * 8388607)));
        v.setUint8(o, s & 0xff); v.setUint8(o + 1, (s >> 8) & 0xff); v.setUint8(o + 2, (s >> 16) & 0xff);
      }
      o += bytesPer;
    }
  }
  return new Uint8Array(buf);
}

export function decodeWav(bytes: Uint8Array): PcmAudio {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Not a WAV file");
  let o = 12;
  let fmt = 0, nCh = 0, sr = 0, bits = 0;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === "fmt ") {
      fmt = v.getUint16(o + 8, true);
      nCh = v.getUint16(o + 10, true);
      sr = v.getUint32(o + 12, true);
      bits = v.getUint16(o + 22, true);
      if (fmt === 0xfffe) fmt = v.getUint16(o + 32, true); // WAVE_FORMAT_EXTENSIBLE subformat
    } else if (id === "data") {
      const bytesPer = bits / 8;
      const frames = Math.floor(Math.min(size, bytes.length - o - 8) / (bytesPer * nCh));
      const channels = Array.from({ length: nCh }, () => new Float32Array(frames));
      let p = o + 8;
      for (let i = 0; i < frames; i++)
        for (let c = 0; c < nCh; c++) {
          let x: number;
          if (fmt === 3 && bits === 32) x = v.getFloat32(p, true);
          else if (bits === 16) x = v.getInt16(p, true) / 32768;
          else if (bits === 24) {
            let s = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getUint8(p + 2) << 16);
            if (s & 0x800000) s |= ~0xffffff;
            x = s / 8388608;
          } else if (bits === 32) x = v.getInt32(p, true) / 2147483648;
          else if (bits === 8) x = (v.getUint8(p) - 128) / 128;
          else throw new Error(`Unsupported WAV bit depth ${bits}`);
          channels[c][i] = x;
          p += bytesPer;
        }
      return { sampleRate: sr, channels };
    }
    o += 8 + size + (size & 1);
  }
  throw new Error("WAV file has no data chunk");
}
