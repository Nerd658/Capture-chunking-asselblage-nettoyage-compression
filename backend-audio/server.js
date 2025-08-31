const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// --- Helper function to create a WAV header ---
function createWavHeader(dataLength, sampleRate, channels, bitsPerSample) {
    const buffer = Buffer.alloc(44);
    const view = new DataView(buffer.buffer);

    const RIFF = 0x52494646; // "RIFF"
    const WAVE = 0x57415645; // "WAVE"
    const fmt_ = 0x666d7420; // "fmt "
    const data = 0x64617461; // "data"

    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);

    // RIFF chunk descriptor
    view.setUint32(0, RIFF, false);
    view.setUint32(4, 36 + dataLength, true);
    view.setUint32(8, WAVE, false);

    // "fmt " sub-chunk
    view.setUint32(12, fmt_, false);
    view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
    view.setUint16(20, 1, true);  // Audio format (1 for PCM)
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // "data" sub-chunk
    view.setUint32(36, data, false);
    view.setUint32(40, dataLength, true);

    return buffer;
}

const sessions = {};

app.post('/stream-chunk', (req, res) => {
    const { sessionId, chunkIndex, data, isEndOfStream } = req.body; // Ajout de isEndOfStream

    if (!sessionId || chunkIndex === undefined || data === undefined) { // data peut être vide pour le signal de fin
        return res.status(400).json({ message: "Données de fragment manquantes." });
    }

    if (!sessions[sessionId]) {
        console.log(`[${sessionId}] Nouvelle session démarrée.`);
        sessions[sessionId] = { chunks: [], receivedCount: 0, finalResponseSent: false };
    }

    const session = sessions[sessionId];

    // Si c'est un fragment de données (pas le signal de fin)
    if (!isEndOfStream) {
        session.chunks[chunkIndex] = data; // Stocke le chunk à son index
        session.receivedCount++;
        console.log(`[${sessionId}] Fragment ${chunkIndex} reçu. Progrès: ${session.receivedCount} fragments.`);
        res.status(200).json({ message: `Fragment ${chunkIndex} reçu.` });
    } else { // C'est le signal de fin de stream
        console.log(`[${sessionId}] Signal de fin de stream reçu. Fragments totaux: ${session.receivedCount}.`);
        // Empêcher les traitements multiples si le signal est envoyé plusieurs fois
        if (session.finalResponseSent) {
            return res.status(200).json({ message: "Fin de stream déjà traitée." });
        }
        session.finalResponseSent = true;

        // Déclencher l'assemblage et les traitements FFmpeg
        // Utiliser un setTimeout pour ne pas bloquer la réponse du dernier chunk si le traitement est long
        setTimeout(() => {
            console.log(`[${sessionId}] Début du traitement final...`);
            // Assurez-vous que tous les chunks sont bien là (même si le frontend les envoie séquentiellement)
            const allChunksReceived = session.chunks.filter(c => c !== undefined).length === session.receivedCount;
            if (!allChunksReceived) {
                console.error(`[${sessionId}] Erreur: Tous les fragments n'ont pas été reçus ou sont manquants.`);
                // Gérer l'erreur, peut-être renvoyer une erreur au client si possible
                return;
            }

            // Convertir chaque chunk base64 en buffer, PUIS concaténer les buffers.
            const bufferChunks = session.chunks.map(chunk => Buffer.from(chunk, 'base64'));
            console.log(`[${sessionId}] DEBUG: Nombre de buffers binaires à assembler: ${bufferChunks.length}`);
            
            const pcmBuffer = Buffer.concat(bufferChunks);
            console.log(`[${sessionId}] DEBUG: Taille du buffer binaire (PCM) après assemblage: ${pcmBuffer.length}`);

            // Créer l'en-tête WAV en utilisant les paramètres de notre flux
            const wavHeader = createWavHeader(pcmBuffer.length, 16000, 1, 16);
            console.log(`[${sessionId}] DEBUG: Taille de l\'en-tête WAV: ${wavHeader.length}`);

            // Concaténer l'en-tête et les données PCM
            const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);
            console.log(`[${sessionId}] DEBUG: Taille du buffer final WAV (Header + PCM): ${wavBuffer.length}`);

            const filePath = path.join(uploadsDir, `${sessionId}.wav`);

            fs.writeFileSync(filePath, wavBuffer);
            console.log(`[${sessionId}] Fichier WAV assemblé et sauvegardé: ${filePath}`);

            // --- Étape de nettoyage avec FFmpeg ---
            const cleanedFilePath = path.join(uploadsDir, `${sessionId}-cleaned.wav`);
            const ffmpegCommand = `ffmpeg -i "${filePath}" -af "afftdn" "${cleanedFilePath}"`;
            console.log(`[${sessionId}] DEBUG: Exécution de la commande FFmpeg: ${ffmpegCommand}`);

            exec(ffmpegCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[${sessionId}] Erreur FFmpeg: ${error.message}`);
                    // Gérer l'erreur, peut-être supprimer les fichiers partiels
                    return;
                }
                if (stderr) {
                    console.warn(`[${sessionId}] FFmpeg Avertissement: ${stderr}`);
                }
                console.log(`[${sessionId}] Fichier nettoyé sauvegardé: ${cleanedFilePath}`);
                console.log(`[${sessionId}] FFmpeg Output: ${stdout}`);

                // --- Étape de compression Opus avec FFmpeg ---
                const opusFilePath = path.join(uploadsDir, `${sessionId}-cleaned.opus`);
                const ffmpegOpusCommand = `ffmpeg -i "${cleanedFilePath}" -c:a libopus -b:a 64k "${opusFilePath}"`;
                console.log(`[${sessionId}] DEBUG: Exécution de la commande FFmpeg pour Opus: ${ffmpegOpusCommand}`);

                exec(ffmpegOpusCommand, (opusError, opusStdout, opusStderr) => {
                    if (opusError) {
                        console.error(`[${sessionId}] Erreur FFmpeg Opus: ${opusError.message}`);
                        // Gérer l'erreur
                        return;
                    }
                    if (opusStderr) {
                        console.warn(`[${sessionId}] FFmpeg Opus Avertissement: ${opusStderr}`);
                    }
                    console.log(`[${sessionId}] Fichier Opus sauvegardé: ${opusFilePath}`);
                    console.log(`[${sessionId}] FFmpeg Opus Output: ${opusStdout}`);

                    // Envoyer la réponse finale UNIQUEMENT après toutes les opérations FFmpeg
                    delete sessions[sessionId];
                    // La réponse au frontend est déjà envoyée par le premier res.status(200).json
                    // Nous ne pouvons pas envoyer une autre réponse ici.
                    // Le frontend devra se fier au fait que le traitement est lancé.
                    // Si le frontend a besoin d'une confirmation finale, il faudrait un mécanisme de polling ou WebSocket.
                    // Pour l'instant, on se contente de logguer la fin du traitement.
                    console.log(`[${sessionId}] Traitement final terminé.`);
                });
            });
        }, 100); // Petit délai pour s'assurer que le dernier chunk est bien traité

        // Répondre immédiatement au signal de fin de stream pour ne pas bloquer le frontend
        // Le frontend devra se fier aux logs du backend pour la confirmation finale du traitement
        res.status(200).json({ message: "Signal de fin de stream reçu. Traitement lancé en arrière-plan." });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Serveur backend démarré et à l'écoute sur http://0.0.0.0:${port}`);
    console.log("Attente des fragments audio sur /stream-chunk...");
});