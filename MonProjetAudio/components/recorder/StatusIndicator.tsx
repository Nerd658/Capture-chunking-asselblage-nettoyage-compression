import React from 'react';
import { StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { type RecorderStatus } from '@/hooks/useAudioRecorder';

interface StatusIndicatorProps {
    status: RecorderStatus;
}

/**
 * Affiche le statut actuel de l'enregistreur.
 */
export const StatusIndicator = ({ status }: StatusIndicatorProps) => {
    return (
        <ThemedText style={styles.statusText}>
            {status}
        </ThemedText>
    );
};

const styles = StyleSheet.create({
    statusText: {
        fontSize: 18,
        color: '#666',
        marginBottom: 60,
        fontStyle: 'italic',
        height: 25, // Hauteur fixe pour éviter les sauts de layout
    },
});
