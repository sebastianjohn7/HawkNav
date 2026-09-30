import { StyleSheet, Text, View } from "react-native";

export function AlertsModule() {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>Alerts Module</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#607D8B",
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontSize: 18, color: "#fff" },
});
