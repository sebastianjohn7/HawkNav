import { View, ScrollView, Text, StyleSheet, Pressable } from 'react-native'
import React from 'react'

type LevelId = "UHCL.MAIN.DELTA.L1" | "UHCL.MAIN.DELTA.L2";

const FloorSelectionPrompt = ({LEVELS, setUserLevel} 
    : {LEVELS: Array<{id: LevelId, label: string}>,
       setUserLevel: React.Dispatch<React.SetStateAction<LevelId>>}) => {
  return (
    <View style={styles.floorSelectionView}>
        <ScrollView>
            {LEVELS.map((level) => (
                <Pressable
                    style={styles.textButton}
                    onPress={() => setUserLevel(level.id)}>
                    <Text key={level.id}>{level.label}</Text>
                </Pressable>)
            )}
        </ScrollView>
    </View>
  )
}

export default FloorSelectionPrompt

const styles = StyleSheet.create({
    floorSelectionView: {
        height: '30%',
        width: '20%',
        backgroundColor: '#fff',
        borderRadius: 10,
        borderColor: 'black',
        borderWidth: 3
    },
    textButton: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#6c7de7',
        borderRadius: 20,
        borderColor: 'black',
        borderWidth: 1
    }
});