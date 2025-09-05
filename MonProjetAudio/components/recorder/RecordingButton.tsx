import React, { useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';

interface RecordingButtonProps {
    isListening: boolean;
    onPress: () => void;
}

/**
 * Le bouton d'enregistrement circulaire et son animation de pulsation.
 */
export const RecordingButton = ({ isListening, onPress }: RecordingButtonProps) => {
    const colorScheme = useColorScheme() ?? 'light';
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        if (isListening) {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ])
            ).start();
        } else {
            // Stoppe l'animation et réinitialise la valeur
            pulseAnim.stopAnimation(() => {
                pulseAnim.setValue(1);
            });
        }
    }, [isListening, pulseAnim]);

    const animatedStyle = {
        transform: [{ scale: pulseAnim }]
    };

    const buttonColor = isListening ? Colors.dark.tint : Colors.light.tint;
    const pulseColor = isListening ? 'rgba(255, 82, 82, 0.2)' : 'rgba(10, 126, 164, 0.2)';

    return (
        <Animated.View style={[styles.buttonContainer, { backgroundColor: pulseColor }, animatedStyle]}>
            <TouchableOpacity
                onPress={onPress}
                style={[styles.button, { backgroundColor: buttonColor }]}
            >
                <MaterialCommunityIcons 
                    name={isListening ? "stop" : "microphone"} 
                    size={60} 
                    color={isListening ? 'red' : 'white'} 
                />
            </TouchableOpacity>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    buttonContainer: {
        width: 180,
        height: 180,
        borderRadius: 90,
        justifyContent: 'center',
        alignItems: 'center',
    },
    button: {
        width: 120,
        height: 120,
        borderRadius: 60,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
});
