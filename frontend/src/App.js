import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [produceId, setProduceId] = useState('');
  const [produceData, setProduceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchProduce = async () => {
    if (!produceId) return;

    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`http://localhost:3001/api/produce/${produceId}`);
      setProduceData(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch produce data');
      setProduceData(null);
    }
    setLoading(false);
  };

  const generateQR = async () => {
    if (!produceId) return;

    try {
      const response = await axios.get(`http://localhost:3001/api/qr/${produceId}`);
      // In a real app, you'd display the QR code
      alert('QR code generated successfully');
    } catch (err) {
      setError('Failed to generate QR code');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Agricultural Produce Tracking System</h1>
        <p>Blockchain-based transparent supply chain tracking</p>
      </header>

      <main className="App-main">
        <div className="search-section">
          <h2>Verify Produce</h2>
          <div className="input-group">
            <input
              type="text"
              placeholder="Enter Produce ID"
              value={produceId}
              onChange={(e) => setProduceId(e.target.value)}
              className="produce-input"
            />
            <button onClick={fetchProduce} disabled={loading} className="btn-primary">
              {loading ? 'Loading...' : 'Verify'}
            </button>
            <button onClick={generateQR} className="btn-secondary">
              Generate QR
            </button>
          </div>

          {error && <div className="error-message">{error}</div>}

          {produceData && (
            <div className="produce-details">
              <h3>Produce Details</h3>
              <div className="details-grid">
                <div className="detail-item">
                  <strong>ID:</strong> {produceData.id}
                </div>
                <div className="detail-item">
                  <strong>Farmer:</strong> {produceData.farmer}
                </div>
                <div className="detail-item">
                  <strong>Origin:</strong> {produceData.origin}
                </div>
                <div className="detail-item">
                  <strong>Quality:</strong> {produceData.quality}
                </div>
                <div className="detail-item">
                  <strong>Price:</strong> {produceData.initialPrice} ETH
                </div>
                <div className="detail-item">
                  <strong>Timestamp:</strong> {new Date(produceData.timestamp * 1000).toLocaleString()}
                </div>
                <div className="detail-item">
                  <strong>Status:</strong> {produceData.isActive ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="info-section">
          <h2>How It Works</h2>
          <div className="workflow">
            <div className="step">
              <h4>1. Farmers Register Produce</h4>
              <p>Farmers register their produce with origin, quality, and pricing information on the blockchain.</p>
            </div>
            <div className="step">
              <h4>2. Distributors Track Movement</h4>
              <p>Distributors log transfer information and update storage conditions.</p>
            </div>
            <div className="step">
              <h4>3. Retailers Set Prices</h4>
              <p>Retailers update pricing and generate QR codes for consumer verification.</p>
            </div>
            <div className="step">
              <h4>4. Consumers Verify</h4>
              <p>Consumers scan QR codes to view complete produce history and verify authenticity.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
