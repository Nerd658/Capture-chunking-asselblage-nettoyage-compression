import React from 'react';
import { StyleSheet } from 'react-native';
import { ThemedView } from '@/components/ThemedView';
import { ThemedText } from '@/components/ThemedText';

// Import des éléments modulaires
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { RecordingButton } from '@/components/recorder/RecordingButton';
import { StatusIndicator } from '@/components/recorder/StatusIndicator';
import { TimerDisplay } from '@/components/recorder/TimerDisplay';

/**
 * L'écran d'enregistrement.
 * Assemble les composants de l'UI et leur fournit les données et callbacks
 * depuis le hook `useAudioRecorder`.
 */
export default function RecorderScreen() {
  // Le hook nous fournit tout ce dont on a besoin, y compris la nouvelle durée du segment.
  const { isListening, status, segmentDuration, startListening, stopListening } = useAudioRecorder();

  const handlePress = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Enregistreur Audio</ThemedText>
      
      <StatusIndicator status={status} />

      {/* La nouvelle minuterie */}
      <TimerDisplay duration={segmentDuration} />
      
      <RecordingButton isListening={isListening} onPress={handlePress} />

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    position: 'absolute',
    top: 80,
  },
});