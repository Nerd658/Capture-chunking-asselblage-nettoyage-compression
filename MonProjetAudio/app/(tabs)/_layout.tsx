import { Stack } from 'expo-router';

/**
 * Ce layout utilise un "Stack" au lieu de "Tabs" car nous n'avons plus qu'un seul écran.
 * Cela supprime la barre d'onglets en bas de l'écran.
 */
export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          // On cache l'en-tête pour un design plus épuré.
          headerShown: false,
        }}
      />
    </Stack>
  );
}