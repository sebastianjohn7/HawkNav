import { View, Text, StyleSheet, Dimensions, Pressable } from 'react-native'
import React from 'react'
import PanoramaLinks from './PanoramaLinks'

const screenHeight = Dimensions.get('window').height;
const screenWidth = Dimensions.get('window').width;

const DisplayPointInfo = ({object, setEndNode, setDisplayInfo, top = 100, allowedPhotoIds }
    : {object: GeoJSON.Feature,
         /** While a route is active: the only 360° photos that may be opened. */
         allowedPhotoIds?: ReadonlySet<string> | null,
         setEndNode: React.Dispatch<React.SetStateAction<string | null>>,
         setDisplayInfo: React.Dispatch<React.SetStateAction<GeoJSON.Feature | null>>,
         /** Distance from the top of the map; lets the card sit below the search panel. */
         top?: number
        }) => {
  const name = object.properties?.NAME;
  if(name === '1' || name === '2' || !object) return null;

  return (
    <>
    <View style={[styles.displayBox, { top }]}>
      <Text style={styles.title}>Location Information</Text>
      <Text style={styles.displayText}>Name: {object.properties?.NAME}</Text>
      <Text style={styles.displayText}>Description: {object.properties?.USE_TYPE}</Text>
      <Text style={styles.displayText}>Floor: {object.properties?.LEVEL_ID}</Text>
      <Pressable
        style={styles.routeButton}
        onPress={() => {
            // Starting point determined by user location
            console.log("Starting Route");
            setEndNode(object.properties?.NAME);
            setDisplayInfo(null);
            // set new startNode to current user position !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
            }}><Text style={{color: 'white'}}>Route To</Text></Pressable>
    </View>
    <PanoramaLinks object={object} top={top} allowedIds={allowedPhotoIds} />
    </>
  )
}

export default DisplayPointInfo

const styles = StyleSheet.create({
    displayBox: {
        position: 'absolute',
        alignSelf: 'center',
        height: '17%',
        width: '55%',
        backgroundColor: 'white',
        borderRadius: 10,
        zIndex: 998,
        elevation: 50,
        alignItems: 'center',
        top: 100,
        right: 10
    },
    title: {
        fontSize: 15,
        fontWeight: 700,
        color: 'black',
    },
    displayText: {
        color: 'lightGray',
        fontWeight: 500,
        fontSize: 10
    },
    routeButton: {
        marginTop: 5,
        justifyContent: 'center',
        alignItems: 'center',
        height: '30%',
        width: '80%',
        backgroundColor: '#784be8',
        borderRadius: 10
    }
})