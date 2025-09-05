/**
 * Ce service gère toute la communication avec l'API backend pour l'audio.
 */

const backendURL = 'http://192.168.1.83:3000/stream-chunk';

export interface StreamPayload {
    sessionId: string;
    // Index du chunk dans le segment actuel
    chunkIndex: number;
    // Le chunk de données audio en base64
    data: string;
    // Est-ce la fin d'un segment (déclenché par un silence) ?
    isEndOfSegment: boolean;
    // Est-ce la fin de toute la session (déclenché par le bouton stop) ?
    isFinalChunk: boolean;
    // Index du segment dans la session
    segmentIndex: number;
}

/**
 * Envoie un fragment audio au backend.
 * @param payload L'objet contenant les données du fragment.
 * @returns La réponse JSON du serveur.
 */
export const streamAudioChunk = async (payload: StreamPayload) => {
    try {
        const response = await fetch(backendURL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erreur serveur pour le segment ${payload.segmentIndex} / chunk ${payload.chunkIndex}: ${response.status} - ${errorText}`);
        }
        
        console.log(`Envoi: Seg ${payload.segmentIndex} / Chunk ${payload.chunkIndex} / EndOfSeg: ${payload.isEndOfSegment} / Final: ${payload.isFinalChunk}`);
        return response.json();

    } catch (error) {
        console.error(`Échec de l'envoi du chunk:`, error);
        throw error;
    }
};