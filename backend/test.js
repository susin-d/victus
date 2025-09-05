const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api';

// Test suite for backend API
async function runTests() {
    console.log('🧪 Running Backend API Tests...\n');

    // Test 1: Get produce with invalid ID
    try {
        console.log('Test 1: Get produce with invalid ID');
        const response = await axios.get(`${BASE_URL}/produce/invalid`);
        console.log('❌ Should have failed with 400');
    } catch (error) {
        if (error.response?.status === 400) {
            console.log('✅ Correctly returned 400 for invalid ID');
        } else {
            console.log('❌ Unexpected error:', error.response?.status);
        }
    }

    // Test 2: Generate QR with invalid ID
    try {
        console.log('\nTest 2: Generate QR with invalid ID');
        const response = await axios.get(`${BASE_URL}/qr/invalid`);
        console.log('❌ Should have failed with 400');
    } catch (error) {
        if (error.response?.status === 400) {
            console.log('✅ Correctly returned 400 for invalid ID');
        } else {
            console.log('❌ Unexpected error:', error.response?.status);
        }
    }

    // Test 3: Generate QR with valid ID
    try {
        console.log('\nTest 3: Generate QR with valid ID');
        const response = await axios.get(`${BASE_URL}/qr/1`);
        if (response.data.qr) {
            console.log('✅ QR code generated successfully');
        } else {
            console.log('❌ QR code not generated');
        }
    } catch (error) {
        console.log('❌ Error generating QR:', error.response?.data?.error);
    }

    // Test 4: Register produce with missing fields
    try {
        console.log('\nTest 4: Register produce with missing fields');
        const response = await axios.post(`${BASE_URL}/register-produce`, {});
        console.log('❌ Should have failed with 400');
    } catch (error) {
        if (error.response?.status === 400) {
            console.log('✅ Correctly returned 400 for missing fields');
        } else {
            console.log('❌ Unexpected error:', error.response?.status);
        }
    }

    // Test 5: Register produce with invalid price
    try {
        console.log('\nTest 5: Register produce with invalid price');
        const response = await axios.post(`${BASE_URL}/register-produce`, {
            origin: 'Farm A',
            quality: 'Good',
            initialPrice: -10,
            privateKey: '0x123...'
        });
        console.log('❌ Should have failed with 400');
    } catch (error) {
        if (error.response?.status === 400) {
            console.log('✅ Correctly returned 400 for invalid price');
        } else {
            console.log('❌ Unexpected error:', error.response?.status);
        }
    }

    // Test 6: Get produce that doesn't exist
    try {
        console.log('\nTest 6: Get produce that doesn\'t exist');
        const response = await axios.get(`${BASE_URL}/produce/999`);
        console.log('ℹ️  Response:', response.data);
    } catch (error) {
        console.log('ℹ️  Expected error for non-existent produce:', error.response?.data?.error);
    }

    console.log('\n🎉 Test suite completed!');
    console.log('\nNote: Some tests may fail if contracts are not deployed.');
    console.log('To run full integration tests, deploy contracts to testnet first.');
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { runTests };