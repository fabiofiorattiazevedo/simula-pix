const axios = require('axios');

function createPSPClient() {
  return axios.create({
    baseURL: process.env.MP_BASE_URL,
    headers: {
      Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
}

module.exports = { createPSPClient };
