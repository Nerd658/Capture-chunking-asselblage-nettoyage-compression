import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Button, Alert, PermissionsAndroid, Platform } from 'react-native';
import LiveAudioStream from 'react-native-live-audio-stream';
import { Buffer } from 'buffer'; // Nécessaire pour décoder les chunks base64

// Helper pour convertir les données PCM 16-bit (depuis le buffer) en Float32Array
function pcm16tofloat32(buffer: Buffer): Float32Array {
    const output = new Float32Array(buffer.length / 2);
    for (let i = 0; i < buffer.length; i += 2) {
        const value = buffer.readInt16LE(i);
        output[i / 2] = value / 32768.0; // Normalisation entre -1.0 et 1.0
    }
    return output;
}

// Helper pour calculer l'énergie RMS d'un Float32Array
function calculateRMS(buffer: Float32Array): number {
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
        sumSquares += buffer[i] * buffer[i];
    }
    return Math.sqrt(sumSquares / buffer.length);
}

const SILENCE_THRESHOLD = 0.005; // Seuil RMS pour considérer le silence (à ajuster si besoin)
const AUTO_STOP_DELAY = 3000; // 3 secondes de silence avant l'arrêt automatique

export default function App() {
    const [isListening, setIsListening] = useState(false);
    const [status, setStatus] = useState("Prêt");
    
    const sessionId = useRef<string | null>(null);
    const chunkIndexCounter = useRef(0);
    const audioQueue = useRef<string[]>([]); // File d'attente des chunks à envoyer
    const isSending = useRef(false); // Pour éviter les envois multiples en parallèle
    const sendIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastActivityTimeRef = useRef(Date.now()); // Temps de la dernière activité vocale
    const autoStopIntervalRef = useRef<NodeJS.Timeout | null>(null); // Intervalle pour l'arrêt automatique

    useEffect(() => {
        async function requestMicPermission() {
            if (Platform.OS === 'android') {
                try {
                    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
                    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                        Alert.alert("Permission refusée", "L'enregistrement audio est désactivé.");
                    }
                } catch (err) {
                    console.warn(err);
                }
            }
        }
        requestMicPermission();

        LiveAudioStream.on('data', (data: string) => {
            // Chaque fragment reçu est ajouté à la file d'attente
            audioQueue.current.push(data);

            // Détection de silence
            const pcmFloat32 = pcm16tofloat32(Buffer.from(data, 'base64'));
            const rms = calculateRMS(pcmFloat32);

            if (rms > SILENCE_THRESHOLD) {
                lastActivityTimeRef.current = Date.now(); // Réinitialise le timer de silence
                setStatus("Écoute en cours (activité vocale)...");
            } else {
                setStatus("Écoute en cours (silence)...");
            }
        });

        return () => {
            LiveAudioStream.stop();
            if (sendIntervalRef.current) {
                clearInterval(sendIntervalRef.current);
            }
            if (autoStopIntervalRef.current) {
                clearInterval(autoStopIntervalRef.current);
            }
        };
    }, []);

    const sendChunkToBackend = async (chunk: string, isEndOfStream: boolean = false) => {
        const currentSessionId = sessionId.current;
        if (!currentSessionId) return; // Ne devrait pas arriver en mode écoute

        const currentChunkIndex = chunkIndexCounter.current++;
        const backendURL = 'http://172.20.5.0:3000/stream-chunk';

        try {
            const response = await fetch(backendURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    chunkIndex: currentChunkIndex,
                    data: chunk,
                    isEndOfStream: isEndOfStream,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erreur serveur pour le fragment ${currentChunkIndex}: ${response.status} - ${errorText}`);
            }
            console.log(`Fragment ${currentChunkIndex} envoyé. isEndOfStream: ${isEndOfStream}`);
            return response.json(); // Retourne la réponse du backend

        } catch (error) {
            console.error(`Échec de l'envoi du fragment ${currentChunkIndex}:`, error);
            setStatus(`Erreur envoi fragment ${currentChunkIndex}`);
            throw error; // Propager l'erreur pour la gestion dans stopListening
        }
    };

    const processQueue = async () => {
        if (isSending.current || audioQueue.current.length === 0) {
            return; // Déjà en cours d'envoi ou rien à envoyer
        }

        isSending.current = true;
        const chunkToSend = audioQueue.current.shift(); // Prend le premier chunk de la file

        if (chunkToSend) {
            try {
                await sendChunkToBackend(chunkToSend);
            } catch (error) {
                // Gérer l'erreur, peut-être remettre le chunk dans la file ou réessayer
                console.error("Erreur lors du traitement de la file:", error);
            } finally {
                isSending.current = false;
            }
        }
    };

    const startListening = () => {
        console.log("Démarrage de l'écoute...");
        sessionId.current = `session-${Date.now()}`;
        chunkIndexCounter.current = 0;
        audioQueue.current = [];
        isSending.current = false;
        setIsListening(true);
        lastActivityTimeRef.current = Date.now(); // Initialise le temps de dernière activité
        setStatus("Écoute en cours...");

        const options = { sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 6, bufferSize: 4096 };
        LiveAudioStream.init(options);
        LiveAudioStream.start();

        // Démarrer l'intervalle d'envoi des chunks
        sendIntervalRef.current = setInterval(processQueue, 100); // Envoie un chunk toutes les 100ms

        // Démarrer l'intervalle d'arrêt automatique
        autoStopIntervalRef.current = setInterval(() => {
            if (Date.now() - lastActivityTimeRef.current > AUTO_STOP_DELAY) {
                console.log("Arrêt automatique: Silence prolongé détecté.");
                stopListening(); // Appelle la fonction d'arrêt
            }
        }, 500); // Vérifie toutes les 500ms
    };

    const stopListening = async () => {
        console.log("Arrêt de l'écoute demandé.");
        LiveAudioStream.stop();
        setIsListening(false);
        if (sendIntervalRef.current) {
            clearInterval(sendIntervalRef.current);
            sendIntervalRef.current = null;
        }
        if (autoStopIntervalRef.current) {
            clearInterval(autoStopIntervalRef.current);
            autoStopIntervalRef.current = null;
        }
        setStatus("Finalisation de l'envoi...");

        // Attendre que tous les chunks restants dans la file soient envoyés
        while (audioQueue.current.length > 0 || isSending.current) {
            await new Promise(resolve => setTimeout(resolve, 50)); // Attendre un court instant
            await processQueue(); // Tenter d'envoyer le prochain chunk
        }

        // Envoyer le signal de fin de stream
        try {
            console.log("Envoi du signal de fin de stream...");
            const finalResponse = await sendChunkToBackend('', true); // Envoyer un chunk vide avec isEndOfStream: true
            console.log("Réponse finale du backend:", finalResponse);
            Alert.alert("Succès", "Enregistrement terminé et traité !");
            setStatus("Terminé et traité !");
        } catch (error) {
            console.error("Erreur lors de l'envoi du signal de fin:", error);
            Alert.alert("Erreur", `Échec de la finalisation: ${error.message}`);
            setStatus("Erreur de finalisation.");
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Enregistreur Audio Live</Text>
            <Text style={styles.statusText}>{status}</Text>
            <View style={styles.spacer} />
            <Button
                title={isListening ? "Arrêter" : "Démarrer l'écoute"}
                onPress={isListening ? stopListening : startListening}
                color={isListening ? 'red' : 'green'}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5', padding: 20 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20 },
    statusText: { fontSize: 18, color: '#666', marginBottom: 20 },
    spacer: { height: 20 },
});