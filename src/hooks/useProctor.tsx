import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import useProctorStore from '@/store/useProctorStore';
import * as tf from '@tensorflow/tfjs';

type ViolationType =
  | 'no-face'
  | 'multiple-faces'
  | 'look-away'
  | 'face-offscreen'
  | 'camera-covered';

type UseProctorOptions = {
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  onWarning?: (type: ViolationType, message?: string) => void;
  sessionId?: string;
  userId?: string;
};

export function useProctor({
  videoRef,
  onWarning,
  sessionId,
  userId,
}: UseProctorOptions) {
  const enabled = useProctorStore((s) => s.enabled);
  const setStatus = useProctorStore((s) => s.setStatus);
  const addViolation = useProctorStore((s) => s.addViolation);
  const addWarning = useProctorStore((s) => s.addWarning);
  const stopStore = useProctorStore((s) => s.stop);

  const modelRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const socketRef = useRef<any>(null);

  const lastWarningTimeRef = useRef<number>(0);
  const consecutiveNoFaceRef = useRef<number>(0);
  const consecutiveMultiFaceRef = useRef<number>(0);
  const consecutiveDarkFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }
    let mounted = true;

    (async () => {
      try {
        setStatus('initializing');
        await tf.setBackend('webgl');
        await tf.ready();

        const model = await tf.loadGraphModel('/models/blazeface.json');
        modelRef.current = model;
        
        if (mounted) {
          setStatus('ready');
          console.log('Proctoring system ready and monitoring');
        }

        try {
          const { io } = await import('socket.io-client');
          socketRef.current = io(
            (import.meta.env as any).VITE_PROCTOR_SERVER ||
              window.location.origin
          );
        } catch {}

        const loop = async () => {
          if (!mounted) return;

          try {
            const video = videoRef.current;
            if (
              video &&
              !video.paused &&
              !video.ended &&
              video.videoWidth > 0
            ) {
              const input = tf.tidy(() => {
                const tensor = tf.browser.fromPixels(video);
                const resized = tf.image.resizeBilinear(tensor, [256, 256]);
                const normalized = resized.div(255);
                return normalized.expandDims(0);
              });

              const predictions = (await model.predict(input)) as tf.Tensor[];
              const scores = predictions[1];
              const scoresData = await scores.data();

              // ---------- FACE COUNT ----------
              let faceCount = 0;
              for (let i = 0; i < scoresData.length; i++) {
                if (scoresData[i] > 0.75) faceCount++;
              }

              // ---------- CAMERA COVERED CHECK ----------
              const brightnessTensor = tf.tidy(() =>
                tf.browser
                  .fromPixels(video)
                  .mean()
                  .dataSync()[0]
              );

              if (brightnessTensor < 25) {
                consecutiveDarkFrameRef.current++;
              } else {
                consecutiveDarkFrameRef.current = 0;
              }

              const now = Date.now();

              const WARNING_COOLDOWN = 5000; // 5 seconds (reduced from 15s for better responsiveness)
              const NO_FACE_PERSISTENCE = 45; // ~1.5 seconds (reduced from 90)
              const MULTI_FACE_PERSISTENCE = 15; // ~0.5 seconds (reduced from 30)
              const DARK_FRAME_PERSISTENCE = 30; // ~1 second (reduced from 60)

              const canWarn =
                now - lastWarningTimeRef.current > WARNING_COOLDOWN;

              if (
                consecutiveDarkFrameRef.current > DARK_FRAME_PERSISTENCE &&
                canWarn
              ) {
                const violation = {
                  id: String(now),
                  type: 'camera-covered' as ViolationType,
                  timestamp: now,
                  message: 'Camera appears to be covered',
                };

                addWarning();
                addViolation(violation);
                onWarning?.('camera-covered', violation.message);
                socketRef.current?.emit?.('violation', {
                  ...violation,
                  sessionId,
                  userId,
                });

                lastWarningTimeRef.current = now;
                consecutiveDarkFrameRef.current = 0;
              } else if (faceCount === 0) {
                consecutiveNoFaceRef.current++;
                consecutiveMultiFaceRef.current = 0;

                if (
                  consecutiveNoFaceRef.current > NO_FACE_PERSISTENCE &&
                  canWarn
                ) {
                  const violation = {
                    id: String(now),
                    type: 'no-face' as ViolationType,
                    timestamp: now,
                    message: 'Face not detected',
                  };

                  addWarning();
                  addViolation(violation);
                  onWarning?.('no-face', violation.message);
                  socketRef.current?.emit?.('violation', {
                    ...violation,
                    sessionId,
                    userId,
                  });

                  lastWarningTimeRef.current = now;
                }
              } else if (faceCount > 1) {
                consecutiveMultiFaceRef.current++;
                consecutiveNoFaceRef.current = 0;

                if (
                  consecutiveMultiFaceRef.current >
                    MULTI_FACE_PERSISTENCE &&
                  canWarn
                ) {
                  const violation = {
                    id: String(now),
                    type: 'multiple-faces' as ViolationType,
                    timestamp: now,
                    message: 'Multiple faces detected',
                  };

                  addWarning();
                  addViolation(violation);
                  onWarning?.('multiple-faces', violation.message);
                  socketRef.current?.emit?.('violation', {
                    ...violation,
                    sessionId,
                    userId,
                  });

                  lastWarningTimeRef.current = now;
                }
              } else {
                consecutiveNoFaceRef.current = 0;
                consecutiveMultiFaceRef.current = 0;
              }

              tf.dispose([input, ...predictions]);
            }
          } catch (err) {
            console.error('Proctor detect error:', err);
            setStatus('error');
            stopStore();
            return;
          }

          rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error('Failed to initialize proctoring:', err);
        setStatus('error');
        stopStore();
      }
    })();

    return () => {
      mounted = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        modelRef.current?.dispose();
        socketRef.current?.disconnect();
      } catch {}
    };
  }, [enabled]);

  return { enabled };
}


export default useProctor;
