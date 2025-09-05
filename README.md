# Projet Audio : Pipeline Conversationnel en Temps Réel

## Vision du Projet

Ce projet implémente un pipeline audio complet et robuste, conçu pour servir de fondation à une **application conversationnelle en temps réel**. L'objectif final est de capturer la parole d'un utilisateur, de la transcrire en texte (Speech-to-Text), d'envoyer ce texte à une IA pour générer une réponse, et de convertir cette réponse en audio (Text-to-Speech).

Cette version du projet se concentre sur la première brique, la plus critique : une capture audio intelligente, segmentée par les silences, et un traitement backend fiable.

## Fonctionnalités Clés

- **Capture Audio Continue** : L'application écoute en continu, sans jamais s'arrêter d'elle-même.
- **Détection de Silence Intelligente (VAD)** : L'application détecte les pauses dans la parole de l'utilisateur. Cette détection est robuste et ignore les bruits parasites ou les micro-pauses.
- **Segmentation Automatique** : Chaque fois qu'une pause de **800ms** est détectée, l'audio enregistré jusque-là est considéré comme un "segment" (une phrase ou une prise de parole) et est envoyé pour traitement.
- **Streaming en Temps Réel** : Les données audio sont envoyées en petits fragments continus vers le backend pour une latence minimale.
- **Traitement Backend par Segment** : Le serveur Node.js traite chaque segment individuellement, créant pour chacun un pipeline de fichiers : `.wav` (brut), `-cleaned.wav` (nettoyé avec FFmpeg), et `.opus` (compressé, idéal pour le STT).
- **Préparation pour le Speech-to-Text (STT)** : Le code backend contient un emplacement clairement défini et documenté pour intégrer facilement n'importe quel moteur de STT.
- **Architecture Frontend Modulaire** : Le code de l'application (React Native) a été entièrement refactorisé pour suivre les meilleures pratiques, en isolant la logique (Hooks), les appels réseau (Services) et l'interface (Composants).

## Architecture et Flux de Données

Le flux de données est pensé pour une conversation. Une session d'enregistrement peut contenir plusieurs segments, chacun déclenché par un silence.

```mermaid
graph TD
    A[Microphone] --> B(Application Mobile - Frontend);
    B --> C{Capture Audio en Continu};
    C --> D{Détection de Silence Robuste};
    
    subgraph "Boucle Conversationnelle"
        direction LR
        D -- Pause de 800ms --> E{Finalisation du Segment};
        E -- Chunks Audio du Segment --> F(Serveur Node.js - Backend);
        F --> G{Traitement du Segment};
        G --> H[Fichiers Audio du Segment (.wav, .opus)];
        H --> I{Placeholder STT};
        I --> J[Texte Transcrit];
        E --> C;
    end

    B -- Bouton Stop --> K{Arrêt Final de la Session};
```

## Structure du Projet

- **`MonProjetAudio/`** : Le frontend en React Native (Expo).
  - **`app/`** : La structure des écrans. Le projet est maintenant mono-écran.
  - **`components/`** : Contient les composants d'interface réutilisables.
    - **`recorder/`** : Les composants spécifiques à l'écran d'enregistrement.
  - **`hooks/`** : Contient le coeur de la logique du frontend, `useAudioRecorder.ts`.
  - **`services/`** : Gère la communication avec le backend.
- **`backend-audio/`** : Le backend en Node.js (Express).
  - **`server.js`** : Le serveur qui gère la réception, l'assemblage et le traitement des segments.
  - **`uploads/`** : Le dossier où les fichiers audio de chaque segment sont créés.
- **`notes/`** : Contient les notes de développement.

## Prérequis

1.  **Node.js et npm**
2.  **Expo CLI** (`npm install -g expo-cli`)
3.  **FFmpeg** : Indispensable pour le traitement audio sur le backend. Doit être installé et accessible dans le PATH du système.

## Installation et Démarrage

L'installation et le démarrage restent les mêmes. Assurez-vous de lancer le backend avant le frontend.

1.  **Backend**
    ```bash
    cd backend-audio
    npm install
    node server.js
    ```
2.  **Frontend** (dans un autre terminal)
    ```bash
    cd MonProjetAudio
    npm install
    # Mettez à jour l'IP du backend dans services/audioService.ts
    npx expo run:android # ou run:ios
    ```

## Prochaines Étapes

La prochaine étape logique est de remplir la fonction `lancerTranscription()` dans le fichier `backend-audio/server.js` avec un vrai moteur de Speech-to-Text pour compléter le pipeline.