import React from 'react';
import { StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';

interface TimerDisplayProps {
    duration: number; // Durée en secondes, peut être une décimale
}

/**
 * Affiche la durée formatée en MM:SS.S.
 */
export const TimerDisplay = ({ duration }: TimerDisplayProps) => {
    const formatTime = (timeInSeconds: number) => {
        const minutes = Math.floor(timeInSeconds / 60);
        const seconds = Math.floor(timeInSeconds % 60);
        const tenths = Math.floor((timeInSeconds * 10) % 10);
        
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${tenths}`;
    };

    return (
        <ThemedText style={styles.timerText}>
            {formatTime(duration)}
        </ThemedText>
    );
};

const styles = StyleSheet.create({
    timerText: {
        fontSize: 48,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 40,
        fontVariant: ['tabular-nums'], // Assure que les chiffres ont la même largeur pour éviter les sauts
        textShadowColor: 'rgba(0, 0, 0, 0.1)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
});