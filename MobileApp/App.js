import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import QRCodeScanner from 'react-native-qrcode-scanner';
import axios from 'axios';

const App = () => {
  const [produceId, setProduceId] = useState('');
  const [produceData, setProduceData] = useState(null);
  const [scanning, setScanning] = useState(false);

  const getProduce = async (id) => {
    try {
      const response = await axios.get(`http://localhost:3001/api/produce/${id}`);
      setProduceData(response.data);
      Alert.alert('Produce Details', `ID: ${response.data.id}\nOrigin: ${response.data.origin}\nQuality: ${response.data.quality}\nPrice: ${response.data.initialPrice}`);
    } catch (error) {
      Alert.alert('Error', error.response?.data?.error || 'Failed to fetch produce');
    }
  };

  const onSuccess = (e) => {
    const scannedId = e.data; // Assume QR contains produce ID
    setProduceId(scannedId);
    getProduce(scannedId);
    setScanning(false);
  };

  if (scanning) {
    return (
      <QRCodeScanner
        onRead={onSuccess}
        topContent={<Text style={styles.centerText}>Scan QR Code to Verify Produce</Text>}
        bottomContent={
          <View>
            <Button title="Cancel" onPress={() => setScanning(false)} />
          </View>
        }
      />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Agricultural Produce Tracking</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter Produce ID"
        value={produceId}
        onChangeText={setProduceId}
      />

      <Button title="Verify Produce" onPress={() => getProduce(produceId)} />

      <Button title="Scan QR Code" onPress={() => setScanning(true)} />

      {produceData && (
        <View style={styles.details}>
          <Text>ID: {produceData.id}</Text>
          <Text>Farmer: {produceData.farmer}</Text>
          <Text>Origin: {produceData.origin}</Text>
          <Text>Quality: {produceData.quality}</Text>
          <Text>Price: {produceData.initialPrice}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    marginBottom: 10,
  },
  centerText: {
    fontSize: 18,
    textAlign: 'center',
    margin: 10,
  },
  details: {
    marginTop: 20,
  },
});

export default App;