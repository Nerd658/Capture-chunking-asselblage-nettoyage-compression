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

// =================================================================
// --- SECTION SPEECH-TO-TEXT (STT) --- 
// =================================================================

/**
 * Lance la transcription audio en texte pour un fichier donné.
 * C'EST ICI QUE VOUS DEVEZ INTÉGRER VOTRE MOTEUR STT.
 * @param {string} audioFilePath Le chemin absolu vers le fichier audio à transcrire.
 */
async function lancerTranscription(audioFilePath) {
    console.log(`[STT] Prêt à lancer la transcription pour : ${audioFilePath}`);

    // =================================================================
    // --- REMPLACEZ CETTE PARTIE PAR VOTRE LOGIQUE DE TRANSCRIPTION --- 
    // =================================================================

    // --- EXEMPLE 1 : Avec un outil en ligne de commande (comme Whisper de OpenAI) ---
    // Prérequis : Avoir installé Whisper sur la machine (pip install -U openai-whisper)
    /*
    const command = `whisper "${audioFilePath}" --model tiny --language fr --output_format txt`;
    console.log(`[STT] Exécution de la commande : ${command}`);

    exec(command, (error, stdout, stderr) => {
        if (error) {
            console.error(`[STT] Erreur lors de la transcription :`, error);
            return;
        }
        // Whisper crée un fichier .txt avec le même nom.
        const txtFilePath = audioFilePath.replace('.opus', '.txt');
        try {
            const transcribedText = fs.readFileSync(txtFilePath, "utf-8");
            console.log(`[STT] Texte Transcrit : ${transcribedText.trim()}`);
            // Prochaine étape : envoyer ce texte à une IA pour obtenir une réponse.
        } catch (readError) {
            console.error(`[STT] Erreur lors de la lecture du fichier de transcription :`, readError);
        }
    });
    */

    // --- EXEMPLE 2 : Avec une API Cloud (pseudo-code pour AssemblyAI) ---
    /*
    const apiKey = "VOTRE_CLE_API_ASSEMBLYAI";
    const apiEndpoint = "https://api.assemblyai.com/v2/transcript";

    try {
        // 1. Envoyer le fichier pour upload
        const audioData = fs.readFileSync(audioFilePath);
        const uploadResponse = await fetch("https://api.assemblyai.com/v2/upload", {
            method: 'POST',
            headers: { 'authorization': apiKey },
            body: audioData
        });
        const uploadResult = await uploadResponse.json();
        const audioUrl = uploadResult.upload_url;

        // 2. Demander la transcription
        const transcriptResponse = await fetch(apiEndpoint, {
            method: 'POST',
            headers: { 'authorization': apiKey, 'content-type': 'application/json' },
            body: JSON.stringify({ audio_url: audioUrl })
        });
        const transcriptResult = await transcriptResponse.json();
        const transcriptId = transcriptResult.id;

        // 3. Attendre le résultat (polling)
        let status = transcriptResult.status;
        while(status !== 'completed' && status !== 'error') {
            await new Promise(resolve => setTimeout(resolve, 2000));
            const pollResponse = await fetch(`${apiEndpoint}/${transcriptId}`, { headers: { 'authorization': apiKey } });
            const pollResult = await pollResponse.json();
            status = pollResult.status;
        }

        if (status === 'completed') {
            console.log(`[STT] Texte Transcrit : ${pollResult.text}`);
            // Prochaine étape : envoyer ce texte à une IA pour obtenir une réponse.
        }

    } catch (error) {
        console.error(`[STT] Erreur lors de l'appel API :`, error);
    }
    */
   
    console.log("[STT] --- Fin du placeholder de la fonction de transcription ---");
}

// Le reste du code (gestion des chunks, FFmpeg) reste identique...

function createWavHeader(dataLength, sampleRate, channels, bitsPerSample) {
    const buffer = Buffer.alloc(44);
    const view = new DataView(buffer.buffer);
    const RIFF = 0x52494646, WAVE = 0x57415645, fmt_ = 0x666d7420, data = 0x64617461;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    view.setUint32(0, RIFF, false);
    view.setUint32(4, 36 + dataLength, true);
    view.setUint32(8, WAVE, false);
    view.setUint32(12, fmt_, false);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    view.setUint32(36, data, false);
    view.setUint32(40, dataLength, true);
    return buffer;
}

const sessions = {};

app.post('/stream-chunk', (req, res) => {
    const { sessionId, chunkIndex, data, segmentIndex, isEndOfSegment, isFinalChunk } = req.body;

    if (!sessionId || segmentIndex === undefined) {
        return res.status(400).json({ message: "Données de segment ou de session manquantes." });
    }

    if (!sessions[sessionId]) {
        console.log(`[${sessionId}] Nouvelle session démarrée.`);
        sessions[sessionId] = { chunks: [] };
    }

    const session = sessions[sessionId];

    if (data && data.length > 0) {
        console.log(`[${sessionId}] [Seg ${segmentIndex}] Chunk ${chunkIndex} reçu.`);
        session.chunks[chunkIndex] = data;
    }

    if (isEndOfSegment) {
        console.log(`[${sessionId}] [Seg ${segmentIndex}] Signal de fin de segment reçu. isFinalChunk: ${isFinalChunk}`);
        
        const chunksToProcess = [...session.chunks];
        session.chunks = [];

        setTimeout(() => {
            console.log(`[${sessionId}] [Seg ${segmentIndex}] Début du traitement asynchrone...`);
            if (chunksToProcess.length === 0) {
                if (isFinalChunk) delete sessions[sessionId];
                return;
            }

            console.log(`[${sessionId}] [Seg ${segmentIndex}] Assemblage de ${chunksToProcess.length} chunks.`);
            const pcmBuffer = Buffer.concat(chunksToProcess.map(chunk => Buffer.from(chunk, 'base64')));
            console.log(`[${sessionId}] [Seg ${segmentIndex}] Taille du buffer PCM assemblé: ${pcmBuffer.length} bytes.`);

            const wavHeader = createWavHeader(pcmBuffer.length, 16000, 1, 16);
            const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);
            
            const segmentFilePath = path.join(uploadsDir, `${sessionId}-segment-${segmentIndex}.wav`);
            fs.writeFileSync(segmentFilePath, wavBuffer);
            console.log(`[${sessionId}] [Seg ${segmentIndex}] Fichier WAV brut sauvegardé: ${segmentFilePath} (${wavBuffer.length} bytes)`);

            console.log(`[${sessionId}] [Seg ${segmentIndex}] [FFMPEG 1/2] Lancement du nettoyage...`);
            const cleanedFilePath = path.join(uploadsDir, `${sessionId}-segment-${segmentIndex}-cleaned.wav`);
            const ffmpegCommand = `ffmpeg -y -i "${segmentFilePath}" -af "afftdn" "${cleanedFilePath}"`;

            exec(ffmpegCommand, (error, stdout, stderr) => {
                if (error) {
                    console.error(`[${sessionId}] [Seg ${segmentIndex}] ERREUR FFMPEG (nettoyage): ${error.message}`);
                    return;
                }
                console.log(`[${sessionId}] [Seg ${segmentIndex}] [FFMPEG 1/2] Nettoyage terminé.`);

                console.log(`[${sessionId}] [Seg ${segmentIndex}] [FFMPEG 2/2] Lancement de la compression Opus...`);
                const opusFilePath = path.join(uploadsDir, `${sessionId}-segment-${segmentIndex}.opus`);
                const ffmpegOpusCommand = `ffmpeg -y -i "${cleanedFilePath}" -c:a libopus -b:a 64k "${opusFilePath}"`;

                exec(ffmpegOpusCommand, (opusError, opusStdout, opusStderr) => {
                    if (opusError) {
                        console.error(`[${sessionId}] [Seg ${segmentIndex}] ERREUR FFMPEG (Opus): ${opusError.message}`);
                        return;
                    }
                    console.log(`[${sessionId}] [Seg ${segmentIndex}] [FFMPEG 2/2] Compression Opus terminée: ${opusFilePath}`);

                    // APPEL DE LA FONCTION STT ICI !
                    lancerTranscription(opusFilePath);

                    if (isFinalChunk) {
                        console.log(`[${sessionId}] Session terminée. Nettoyage final de la session.`);
                        delete sessions[sessionId];
                    }
                });
            });
        }, 100);
    }

    res.status(200).json({ message: "Chunk reçu." });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Serveur backend démarré et à l'écoute sur http://0.0.0.0:${port}`);
});