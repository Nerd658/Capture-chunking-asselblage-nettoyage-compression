import { useState, useEffect, useRef, useCallback } from "react";
import { Alert, PermissionsAndroid, Platform } from "react-native";
import LiveAudioStream from "react-native-live-audio-stream";
import { Buffer } from "buffer";
import { streamAudioChunk } from "@/services/audioService";

// =================================================================
// --- CONFIGURATION DE LA DÉTECTION DE SILENCE ---
// =================================================================
const SILENCE_THRESHOLD = 0.005;
const AUTO_STOP_DELAY = 800; // Délai de silence final réglé à 800ms

/**
 * NOUVELLE LOGIQUE DE DÉTECTION AVANCÉE
 */
// Taille de l'historique des fragments à analyser.
const HISTORY_WINDOW_SIZE = 15;
// Pourcentage de silence dans l'historique pour considérer que c'est une vraie pause.
const SILENCE_PERCENTAGE_THRESHOLD = 0.8; // 80%


// --- Types et Constantes ---
export type RecorderStatus = "Prêt" | "Initialisation..." | "Enregistrement..." | "Silence détecté..." | "Envoi du segment..." | "Finalisation..." | "Erreur" | "Erreur d'envoi";

// --- Helpers ---
function pcm16tofloat32(buffer: Buffer): Float32Array {
    const output = new Float32Array(buffer.length / 2);
    for (let i = 0; i < buffer.length; i += 2) {
        output[i / 2] = buffer.readInt16LE(i) / 32768.0;
    }
    return output;
}

function calculateRMS(buffer: Float32Array): number {
    let sumSquares = 0;
    for (const sample of buffer) {
        sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / buffer.length);
}

export const useAudioRecorder = () => {
    const [isListening, setIsListening] = useState(false);
    const isListeningRef = useRef(isListening);
    isListeningRef.current = isListening;

    const [status, setStatus] = useState<RecorderStatus>("Prêt");
    const [segmentDuration, setSegmentDuration] = useState(0);
    
    const sessionId = useRef<string | null>(null);
    const segmentIndex = useRef(0);
    const chunkIndexCounter = useRef(0);
    const audioQueue = useRef<string[]>([]);
    const isSending = useRef(false);
    const sendIntervalRef = useRef<NodeJS.Timeout | null>(null);
    
    // --- Refs pour la nouvelle détection ---
    const silenceTimer = useRef<NodeJS.Timeout | null>(null);
    const chunkHistory = useRef<('sound' | 'silence')[]>([]);
    const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const processQueue = useCallback(async (isFinalChunk = false, isEndOfSegment = false) => {
        if (isSending.current || !sessionId.current) return;
        const isLastCall = isFinalChunk || isEndOfSegment;
        if (audioQueue.current.length === 0 && !isLastCall) return;
        isSending.current = true;
        const chunksToSend = [...audioQueue.current];
        audioQueue.current = [];
        try {
            for (let i = 0; i < chunksToSend.length; i++) {
                await streamAudioChunk({ sessionId: sessionId.current, chunkIndex: chunkIndexCounter.current++, data: chunksToSend[i], segmentIndex: segmentIndex.current, isEndOfSegment: false, isFinalChunk: false });
            }
            if (isLastCall) {
                await streamAudioChunk({ sessionId: sessionId.current, chunkIndex: chunkIndexCounter.current, data: '', segmentIndex: segmentIndex.current, isEndOfSegment: isEndOfSegment, isFinalChunk: isFinalChunk });
                chunkIndexCounter.current = 0;
            }
        } catch (error) {
            setStatus('Erreur d\'envoi');
        } finally {
            isSending.current = false;
        }
    }, []);

    const finalizeSegment = useCallback(async () => {
        if (!isListeningRef.current) return;
        silenceTimer.current = null;
        console.log(`%cFIN DU SEGMENT ${segmentIndex.current} DÉTECTÉE`, 'color: #orange; font-weight: bold;');
        setStatus('Envoi du segment...');
        if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
        await processQueue(false, true);
        segmentIndex.current++;
        chunkHistory.current = []; // Vider l'historique pour le nouveau segment
        setSegmentDuration(0);
        setStatus('Enregistrement...');
        if (isListeningRef.current) {
            sendIntervalRef.current = setInterval(() => processQueue(), 500);
        }
    }, [processQueue]);

    useEffect(() => {
        LiveAudioStream.on('data', (data: string) => {
            if (!isListeningRef.current) return;
            audioQueue.current.push(data);
            const pcmFloat32 = pcm16tofloat32(Buffer.from(data, 'base64'));
            const rms = calculateRMS(pcmFloat32);

            const currentChunkState = rms > SILENCE_THRESHOLD ? 'sound' : 'silence';

            // Mettre à jour le statut de l'UI instantanément
            setStatus(currentChunkState === 'sound' ? 'Enregistrement...' : 'Silence détecté...');

            // Gérer l'historique des chunks
            chunkHistory.current.push(currentChunkState);
            if (chunkHistory.current.length > HISTORY_WINDOW_SIZE) {
                chunkHistory.current.shift(); // Garder l'historique à une taille fixe
            }

            // Analyser l'historique pour prendre une décision
            const silentChunksInHistory = chunkHistory.current.filter(c => c === 'silence').length;
            const silencePercentage = silentChunksInHistory / chunkHistory.current.length;

            if (silencePercentage >= SILENCE_PERCENTAGE_THRESHOLD) {
                // Si la période est majoritairement silencieuse, démarrer le minuteur
                if (!silenceTimer.current) {
                    console.log(`%cSilence confirmé (${(silencePercentage * 100).toFixed(0)}%), démarrage du minuteur de ${AUTO_STOP_DELAY}ms.`, 'color: #ff0000');
                    silenceTimer.current = setTimeout(finalizeSegment, AUTO_STOP_DELAY);
                }
            } else {
                // Si la période redevient sonore, annuler tout minuteur en cours
                if (silenceTimer.current) {
                    console.log("%cSon détecté, annulation du minuteur de silence.", 'color: #008000');
                    clearTimeout(silenceTimer.current);
                    silenceTimer.current = null;
                }
            }
        });

        const requestMicPermission = async () => {
            if (Platform.OS === 'android') {
                try {
                    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
                    if (granted !== PermissionsAndroid.RESULTS.GRANTED) Alert.alert("Permission refusée");
                } catch (err) { console.warn(err); }
            }
        }
        requestMicPermission();
        return () => { LiveAudioStream.stop(); };
    }, [finalizeSegment]);

    const startListening = () => {
        console.log("DÉMARRAGE DE LA SESSION D'ÉCOUTE");
        sessionId.current = `session-${Date.now()}`;
        chunkIndexCounter.current = 0;
        segmentIndex.current = 0;
        audioQueue.current = [];
        isSending.current = false;
        chunkHistory.current = [];
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
        setSegmentDuration(0);
        setIsListening(true);
        setStatus('Initialisation...');
        const options = { sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 6, bufferSize: 4096 };
        LiveAudioStream.init(options);
        LiveAudioStream.start();
        sendIntervalRef.current = setInterval(() => processQueue(), 500);
        durationIntervalRef.current = setInterval(() => setSegmentDuration(d => d + 1), 1000);
    };

    const stopListening = async () => {
        if (!isListeningRef.current) return;
        console.log("ARRÊT MANUEL DE LA SESSION");
        setIsListening(false);
        if (silenceTimer.current) clearTimeout(silenceTimer.current);
        if (sendIntervalRef.current) clearInterval(sendIntervalRef.current);
        if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
        setStatus('Finalisation...');
        await processQueue(true, true);
        LiveAudioStream.stop();
        Alert.alert("Session terminée");
        setStatus('Prêt');
        setSegmentDuration(0);
    };

    return { isListening, status, segmentDuration, startListening, stopListening };
};
