"use client";

import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";

/**
 * Cámara + jsQR corriendo cuadro a cuadro sobre un canvas oculto. Llama a
 * onDecodificado con el texto crudo del QR la primera vez que encuentra uno
 * y para de leer (el padre decide si es válido y qué hacer; para volver a
 * escanear hay que desmontar y montar el componente de nuevo).
 */
export function EscanerQr({ onDecodificado }: { onDecodificado: (texto: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const decodificadoRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cuadroSolicitado: number | null = null;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const contexto = canvas.getContext("2d", { willReadFrequently: true });

    function leerCuadro() {
      if (!video || !contexto || decodificadoRef.current) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        contexto.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imagen = contexto.getImageData(0, 0, canvas.width, canvas.height);
        const resultado = jsQR(imagen.data, imagen.width, imagen.height);

        if (resultado?.data) {
          decodificadoRef.current = true;
          onDecodificado(resultado.data);
          return;
        }
      }

      cuadroSolicitado = requestAnimationFrame(leerCuadro);
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (video) {
          video.srcObject = s;
          void video.play();
          cuadroSolicitado = requestAnimationFrame(leerCuadro);
        }
      })
      .catch(() => {
        setError("No se pudo acceder a la cámara. Revisá los permisos del navegador.");
      });

    return () => {
      if (cuadroSolicitado !== null) cancelAnimationFrame(cuadroSolicitado);
      stream?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDecodificado no debe reiniciar la cámara.
  }, []);

  if (error) {
    return <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>;
  }

  return (
    <div className="relative overflow-hidden rounded-lg bg-black">
      <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
      <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" />
    </div>
  );
}
