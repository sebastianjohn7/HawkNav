import { ScrollView, Text, Pressable, StyleSheet } from 'react-native'
import React from 'react'

const StartRoomSelectionTesting = ({rooms, setDisplayStartOptions, setStartNode}
    : {rooms: string[], setDisplayStartOptions: React.Dispatch<React.SetStateAction<Boolean>>, setStartNode: React.Dispatch<React.SetStateAction<string | null>>}) => {
  return (
    <>
      
        <ScrollView style={styles.scrollView}>
            <Text style={[{fontSize: 12}, {fontWeight: 'bold'}]}>Select a Starting Location:</Text>
            {rooms.map((room, index) => (
                <Pressable key={index}
                    onPress={() => {
                        console.log(`\nSetting ${room} as starting node`);
                        setStartNode(room);
                        setDisplayStartOptions(false);
                    }}><Text style={styles.textButton}>{room}</Text></Pressable>
            ))}
        </ScrollView>
      
    </>
  )
}

export default StartRoomSelectionTesting

const styles = StyleSheet.create({
    scrollView:{
        flex: 1,
        width: '50%',
        zIndex: 999,
    },
    textButton: {
        backgroundColor: '#a185ea',
        borderRadius: 10,
        fontSize: 30,
        margin: 5
    }
})