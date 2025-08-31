
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Button, Alert, PermissionsAndroid, Platform } from 'react-native';
import LiveAudioStream from 'react-native-live-audio-stream';

export default function App() {
    const [isListening, setIsListening] = useState(false);
    const [status, setStatus] = useState("Prêt");
    const audioChunks = useRef<string[]>([]);

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
            console.log(`Fragment reçu, taille: ${data.length}`); // Log de diagnostic
            audioChunks.current.push(data);
        });

        return () => {
            LiveAudioStream.stop();
        };
    }, []);

    const startListening = () => {
        console.log("Démarrage de l'écoute...");
        audioChunks.current = [];
        setIsListening(true);
        setStatus("Écoute en cours...");
        const options = { sampleRate: 16000, channels: 1, bitsPerSample: 16, audioSource: 6, bufferSize: 4096 };
        LiveAudioStream.init(options);
        LiveAudioStream.start();
    };

    const stopAndSendChunks = async () => {
        console.log("Arrêt de l'écoute.");
        LiveAudioStream.stop();
        setIsListening(false);
        setStatus(`Terminé. ${audioChunks.current.length} fragments capturés.`);

        if (audioChunks.current.length === 0) {
            Alert.alert("Rien à envoyer", "Aucun audio n'a été capturé.");
            return;
        }

        console.log("--- DÉBUT DE L'ENVOI DES FRAGMENTS ---");
        const sessionId = `session-${Date.now()}`;
        const totalChunks = audioChunks.current.length;
        const backendURL = 'http://172.20.5.0:3000/stream-chunk';

        try {
            for (let i = 0; i < totalChunks; i++) {
                const chunk = audioChunks.current[i];
                const statusText = `Envoi du fragment ${i + 1} / ${totalChunks}`;
                console.log(statusText);
                setStatus(statusText);

                const response = await fetch(backendURL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        chunkIndex: i,
                        totalChunks: totalChunks,
                        data: chunk,
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Erreur du serveur pour le fragment ${i}: ${response.status} - ${errorText}`);
                }
            }

            console.log("--- TOUS LES FRAGMENTS ONT ÉTÉ ENVOYÉS ---");
            Alert.alert("Succès", "Tous les fragments ont été envoyés avec succès !");
            setStatus("Terminé et envoyé !");

        } catch (error) {
            console.error("Échec de l'envoi des fragments :", error);
            Alert.alert("Échec de l'envoi", `Une erreur est survenue: ${error.message}`);
            setStatus("Erreur lors de l'envoi.");
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Enregistreur Audio Live</Text>
            <Text style={styles.statusText}>{status}</Text>
            <View style={styles.spacer} />
            <Button
                title={isListening ? "Arrêter et Envoyer" : "Démarrer l'écoute"}
                onPress={isListening ? stopAndSendChunks : startListening}
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
