// Export vidéo : enregistre le canvas (et l'audio : musique + micro éventuel) avec MediaRecorder.

const TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4;codecs=avc1,opus",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function bestMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  return TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

/**
 * Enregistre la vidéo en temps réel.
 * opts.draw(t) dessine l'image au temps t ; opts.audioStream (MediaStream) est mixé ; opts.onTime(t) suit l'avancement.
 * Renvoie { blob, ext } ; opts.signal (AbortSignal) arrête l'export proprement.
 */
export function recordVideo(canvas, { duration, draw, audioStream, onTime = () => {}, signal, fps = 30, bitrate = 8_000_000 }) {
  return new Promise((resolve, reject) => {
    const mime = bestMimeType();
    if (mime === null) return reject(new Error("NO_RECORDER"));
    const video = canvas.captureStream(fps);
    const tracks = [...video.getVideoTracks(), ...(audioStream?.getAudioTracks() ?? [])];
    const stream = new MediaStream(tracks);
    const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: bitrate, audioBitsPerSecond: 160_000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onerror = (e) => reject(e.error ?? new Error("RECORDER"));
    rec.onstop = () => {
      video.getTracks().forEach((t) => t.stop());
      // Export annulé : pas de fichier à moitié fini.
      if (signal?.aborted) return reject(new Error("ABORTED"));
      const type = rec.mimeType || mime || "video/webm";
      resolve({ blob: new Blob(chunks, { type }), ext: type.includes("mp4") ? "mp4" : "webm" });
    };
    draw(0);
    rec.start(1000);
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (signal?.aborted || t >= duration) {
        draw(Math.min(t, duration));
        // Laisse la dernière image entrer dans l'enregistrement.
        setTimeout(() => rec.state !== "inactive" && rec.stop(), 150);
        return;
      }
      draw(t);
      onTime(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    signal?.addEventListener("abort", () => {
      cancelAnimationFrame(raf);
      if (rec.state !== "inactive") rec.stop();
    });
  });
}
