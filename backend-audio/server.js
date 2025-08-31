
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
    const { sessionId, chunkIndex, totalChunks, data } = req.body;

    if (!sessionId || chunkIndex === undefined || !totalChunks || !data) {
        return res.status(400).json({ message: "Données de fragment manquantes." });
    }

    if (!sessions[sessionId]) {
        console.log(`[${sessionId}] Nouvelle session démarrée. Total de fragments attendus: ${totalChunks}`);
        sessions[sessionId] = { chunks: new Array(totalChunks), receivedCount: 0, total: totalChunks };
    }

    const session = sessions[sessionId];

    if (!session.chunks[chunkIndex]) {
        session.chunks[chunkIndex] = data;
        session.receivedCount++;
    }
    
    console.log(`[${sessionId}] Fragment ${chunkIndex + 1}/${totalChunks} reçu. Progrès: ${session.receivedCount}/${session.total}`);

    if (session.receivedCount === session.total) {
        console.log(`[${sessionId}] Tous les fragments reçus. Assemblage et conversion en WAV...`);
        
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
                return;
            }
            if (stderr) {
                console.warn(`[${sessionId}] FFmpeg Avertissement: ${stderr}`);
            }
            console.log(`[${sessionId}] Fichier nettoyé sauvegardé: ${cleanedFilePath}`);
            console.log(`[${sessionId}] FFmpeg Output: ${stdout}`);
        });

        delete sessions[sessionId];
        res.status(200).json({ message: "Session complète, fichier WAV créé et nettoyage lancé.", finalPath: filePath, cleanedPath: cleanedFilePath });

    } else {
        res.status(200).json({ message: `Fragment ${chunkIndex} reçu.` });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Serveur backend démarré et à l'écoute sur http://0.0.0.0:${port}`);
    console.log("Attente des fragments audio sur /stream-chunk...");
});
